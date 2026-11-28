package curadoria

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"aeronautica-simulados/backend/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
)

type AlunoResponse struct {
	ID                   string    `json:"id"`
	Nome                 string    `json:"nome"`
	Email                string    `json:"email"`
	Perfil               string    `json:"perfil"`
	CriadoEm             time.Time `json:"criado_em"`
	TotalSimulados       int       `json:"total_simulados"`
	SimuladosFinalizados int       `json:"simulados_finalizados"`
}

type resetSenhaRequest struct {
	NovaSenha string `json:"nova_senha"`
}

// ListAlunos lista usuários com perfil ALUNO com busca opcional (q) em nome ou e-mail (somente ADMIN).
func (h *Handler) ListAlunos(w http.ResponseWriter, r *http.Request) {
	busca := strings.TrimSpace(r.URL.Query().Get("q"))

	args := []any{"ALUNO"}
	sqlQuery := `
		SELECT u.id::text, u.nome, u.email, u.perfil, u.criado_em,
		       COUNT(s.id)::int AS total_simulados,
		       COUNT(CASE WHEN s.status = 'FINALIZADO' THEN 1 END)::int AS simulados_finalizados
		FROM usuarios u
		LEFT JOIN simulados s ON s.usuario_id = u.id
		WHERE u.perfil = $1`

	if busca != "" {
		args = append(args, "%"+busca+"%")
		sqlQuery += " AND (u.nome ILIKE $2 OR u.email ILIKE $2)"
	}

	sqlQuery += `
		GROUP BY u.id, u.nome, u.email, u.perfil, u.criado_em
		ORDER BY u.criado_em DESC, u.nome ASC`

	rows, err := h.pool.Query(r.Context(), sqlQuery, args...)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao listar alunos.")
		return
	}
	defer rows.Close()

	alunos := make([]AlunoResponse, 0)
	for rows.Next() {
		var a AlunoResponse
		if err := rows.Scan(
			&a.ID,
			&a.Nome,
			&a.Email,
			&a.Perfil,
			&a.CriadoEm,
			&a.TotalSimulados,
			&a.SimuladosFinalizados,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler dados dos alunos.")
			return
		}
		alunos = append(alunos, a)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar lista de alunos.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"alunos": alunos,
	})
}

// ResetSenhaAluno redefine a senha de um usuário com perfil ALUNO usando Argon2id (somente ADMIN).
func (h *Handler) ResetSenhaAluno(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if !isValidUUID(id) {
		writeJSONError(w, http.StatusBadRequest, "ID do aluno inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req resetSenhaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	if utf8.RuneCountInString(req.NovaSenha) < 8 {
		writeJSONError(w, http.StatusBadRequest, "A nova senha deve ter pelo menos 8 caracteres.")
		return
	}

	var perfil string
	err := h.pool.QueryRow(
		r.Context(),
		`SELECT perfil
		 FROM usuarios
		 WHERE id = $1::uuid`,
		id,
	).Scan(&perfil)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Usuário não encontrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar usuário.")
		return
	}

	if perfil != "ALUNO" {
		writeJSONError(w, http.StatusForbidden, "Não é permitido redefinir a senha de um administrador por esta rota.")
		return
	}

	novoHash, err := auth.HashPassword(req.NovaSenha)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar nova senha.")
		return
	}

	tag, err := h.pool.Exec(
		r.Context(),
		`UPDATE usuarios
		 SET senha_hash = $1
		 WHERE id = $2::uuid AND perfil = $3`,
		novoHash,
		id,
		"ALUNO",
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao atualizar senha do aluno.")
		return
	}
	if tag.RowsAffected() == 0 {
		writeJSONError(w, http.StatusNotFound, "Aluno não encontrado.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]string{
		"message": "Senha do aluno atualizada com sucesso.",
	})
}
