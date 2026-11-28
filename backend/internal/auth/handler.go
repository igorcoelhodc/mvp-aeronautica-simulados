package auth

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	pool   *pgxpool.Pool
	tokens *TokenManager
}

func NewHandler(pool *pgxpool.Pool, tokens *TokenManager) *Handler {
	return &Handler{
		pool:   pool,
		tokens: tokens,
	}
}

type UserResponse struct {
	ID       string    `json:"id"`
	Nome     string    `json:"nome"`
	Email    string    `json:"email"`
	Perfil   string    `json:"perfil"`
	Ativo    bool      `json:"ativo"`
	CriadoEm time.Time `json:"criado_em"`
}

type authResponse struct {
	Token   string       `json:"token"`
	Usuario UserResponse `json:"usuario"`
}

type registerRequest struct {
	Nome  string `json:"nome"`
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type loginRequest struct {
	Email string `json:"email"`
	Senha string `json:"senha"`
}

type alterarSenhaRequest struct {
	SenhaAtual string `json:"senha_atual"`
	NovaSenha  string `json:"nova_senha"`
}

// Register cria uma nova conta de ALUNO com ativo = FALSE (aguardando liberação manual do admin).
func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req registerRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	nome := strings.TrimSpace(req.Nome)
	email := strings.ToLower(strings.TrimSpace(req.Email))

	if utf8.RuneCountInString(nome) < 2 || utf8.RuneCountInString(nome) > 120 {
		writeJSONError(w, http.StatusBadRequest, "Informe um nome válido (entre 2 e 120 caracteres).")
		return
	}

	if !isValidEmail(email) || len(email) > 160 {
		writeJSONError(w, http.StatusBadRequest, "Informe um e-mail válido.")
		return
	}

	if utf8.RuneCountInString(req.Senha) < 8 {
		writeJSONError(w, http.StatusBadRequest, "A senha deve ter pelo menos 8 caracteres.")
		return
	}

	senhaHash, err := HashPassword(req.Senha)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar credenciais.")
		return
	}

	var user UserResponse
	err = h.pool.QueryRow(
		r.Context(),
		`INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id::text, nome, email, perfil, ativo, criado_em`,
		nome,
		email,
		senhaHash,
		"ALUNO",
		false,
	).Scan(&user.ID, &user.Nome, &user.Email, &user.Perfil, &user.Ativo, &user.CriadoEm)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeJSONError(w, http.StatusConflict, "Este e-mail já está cadastrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao criar conta.")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"usuario":              user,
		"aguardando_aprovacao": true,
		"message":              "Cadastro realizado com sucesso! Sua conta está aguardando liberação do instrutor para acessar os simulados.",
	})
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))
	if email == "" || req.Senha == "" {
		writeJSONError(w, http.StatusBadRequest, "Informe e-mail e senha.")
		return
	}

	var user UserResponse
	var senhaHash string
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT id::text, nome, email, senha_hash, perfil, ativo, criado_em
		 FROM usuarios
		 WHERE email = $1`,
		email,
	).Scan(&user.ID, &user.Nome, &user.Email, &senhaHash, &user.Perfil, &user.Ativo, &user.CriadoEm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnauthorized, "E-mail ou senha inválidos.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao autenticar usuário.")
		return
	}

	valid, err := VerifyPassword(req.Senha, senhaHash)
	if err != nil || !valid {
		writeJSONError(w, http.StatusUnauthorized, "E-mail ou senha inválidos.")
		return
	}

	if !user.Ativo {
		writeJSONErrorWithCode(w, http.StatusForbidden, AccountDisabledMessage, "ACCOUNT_DISABLED")
		return
	}

	token, err := h.tokens.Generate(user.ID, user.Email, user.Perfil)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao gerar token de acesso.")
		return
	}

	writeJSON(w, http.StatusOK, authResponse{
		Token:   token,
		Usuario: user,
	})
}

func (h *Handler) Me(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	var user UserResponse
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT id::text, nome, email, perfil, ativo, criado_em
		 FROM usuarios
		 WHERE id = $1::uuid`,
		claims.Subject,
	).Scan(&user.ID, &user.Nome, &user.Email, &user.Perfil, &user.Ativo, &user.CriadoEm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar usuário autenticado.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"usuario": user,
	})
}

// AlterarSenha permite ao próprio ALUNO autenticado alterar sua senha validando a senha atual.
// Para perfil ADMIN retorna 403 Forbidden (estrutura pronta para liberação futura).
func (h *Handler) AlterarSenha(w http.ResponseWriter, r *http.Request) {
	claims, ok := ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	if claims.Perfil == "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "Alteração de senha para administradores ainda não está habilitada.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req alterarSenhaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	if req.SenhaAtual == "" {
		writeJSONError(w, http.StatusBadRequest, "Informe sua senha atual.")
		return
	}

	if utf8.RuneCountInString(req.NovaSenha) < 8 {
		writeJSONError(w, http.StatusBadRequest, "A nova senha deve ter pelo menos 8 caracteres.")
		return
	}

	if req.NovaSenha == req.SenhaAtual {
		writeJSONError(w, http.StatusBadRequest, "A nova senha deve ser diferente da senha atual.")
		return
	}

	var senhaHash, perfil string
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT senha_hash, perfil
		 FROM usuarios
		 WHERE id = $1::uuid`,
		claims.Subject,
	).Scan(&senhaHash, &perfil)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusUnauthorized, "Usuário não encontrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar credenciais.")
		return
	}

	if perfil == "ADMIN" {
		writeJSONError(w, http.StatusForbidden, "Alteração de senha para administradores ainda não está habilitada.")
		return
	}

	valid, err := VerifyPassword(req.SenhaAtual, senhaHash)
	if err != nil || !valid {
		writeJSONError(w, http.StatusUnauthorized, "Senha atual incorreta.")
		return
	}

	novoHash, err := HashPassword(req.NovaSenha)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar nova senha.")
		return
	}

	if _, err := h.pool.Exec(
		r.Context(),
		`UPDATE usuarios
		 SET senha_hash = $1
		 WHERE id = $2::uuid`,
		novoHash,
		claims.Subject,
	); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao atualizar senha.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Senha alterada com sucesso!",
	})
}

func isValidEmail(email string) bool {
	if email == "" {
		return false
	}
	parsed, err := mail.ParseAddress(email)
	if err != nil || parsed.Address != email {
		return false
	}
	parts := strings.Split(email, "@")
	return len(parts) == 2 && parts[0] != "" && strings.Contains(parts[1], ".")
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
