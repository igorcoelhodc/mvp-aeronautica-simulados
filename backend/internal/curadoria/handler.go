package curadoria

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Handler struct {
	pool *pgxpool.Pool
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

type CategoriaResponse struct {
	ID                  string    `json:"id"`
	Licenca             string    `json:"licenca"`
	Materia             string    `json:"materia"`
	Ativa               bool      `json:"ativa"`
	TotalQuestoesAtivas int       `json:"total_questoes_ativas"`
	CriadoEm            time.Time `json:"criado_em"`
}

type createCategoriaRequest struct {
	Licenca string `json:"licenca"`
	Materia string `json:"materia"`
}

type QuestaoResponse struct {
	ID               string    `json:"id"`
	CategoriaID      string    `json:"categoria_id"`
	CategoriaLicenca string    `json:"categoria_licenca"`
	CategoriaMateria string    `json:"categoria_materia"`
	Enunciado        string    `json:"enunciado"`
	AlternativaA     string    `json:"alternativa_a"`
	AlternativaB     string    `json:"alternativa_b"`
	AlternativaC     string    `json:"alternativa_c"`
	AlternativaD     string    `json:"alternativa_d"`
	Gabarito         string    `json:"gabarito"`
	Comentario       string    `json:"comentario"`
	Ativa            bool      `json:"ativa"`
	CriadoEm         time.Time `json:"criado_em"`
	AtualizadoEm     time.Time `json:"atualizado_em"`
}

type questaoRequest struct {
	CategoriaID  string `json:"categoria_id"`
	Enunciado    string `json:"enunciado"`
	AlternativaA string `json:"alternativa_a"`
	AlternativaB string `json:"alternativa_b"`
	AlternativaC string `json:"alternativa_c"`
	AlternativaD string `json:"alternativa_d"`
	Gabarito     string `json:"gabarito"`
	Comentario   string `json:"comentario"`
	Ativa        *bool  `json:"ativa,omitempty"`
}

// ListCategorias lista todas as categorias ativas com a contagem de questões ativas (rota autenticada para qualquer perfil).
func (h *Handler) ListCategorias(w http.ResponseWriter, r *http.Request) {
	rows, err := h.pool.Query(
		r.Context(),
		`SELECT c.id::text, c.licenca, c.materia, c.ativa, c.criado_em,
		        COUNT(q.id)::int AS total_questoes_ativas
		 FROM categorias c
		 LEFT JOIN questoes q ON q.categoria_id = c.id AND q.ativa = $1
		 WHERE c.ativa = $1
		 GROUP BY c.id, c.licenca, c.materia, c.ativa, c.criado_em
		 ORDER BY c.licenca ASC, c.materia ASC`,
		true,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao listar categorias.")
		return
	}
	defer rows.Close()

	categorias := make([]CategoriaResponse, 0)
	for rows.Next() {
		var c CategoriaResponse
		if err := rows.Scan(&c.ID, &c.Licenca, &c.Materia, &c.Ativa, &c.CriadoEm, &c.TotalQuestoesAtivas); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler categorias.")
			return
		}
		categorias = append(categorias, c)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar categorias.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"categorias": categorias,
	})
}

// CreateCategoria cria uma nova combinação de licença + matéria (somente ADMIN).
func (h *Handler) CreateCategoria(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req createCategoriaRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	licenca := strings.ToUpper(strings.TrimSpace(req.Licenca))
	materia := strings.TrimSpace(req.Materia)

	if utf8.RuneCountInString(licenca) < 2 || utf8.RuneCountInString(licenca) > 20 {
		writeJSONError(w, http.StatusBadRequest, "Informe uma licença válida (entre 2 e 20 caracteres).")
		return
	}
	if utf8.RuneCountInString(materia) < 2 || utf8.RuneCountInString(materia) > 120 {
		writeJSONError(w, http.StatusBadRequest, "Informe uma matéria válida (entre 2 e 120 caracteres).")
		return
	}

	var cat CategoriaResponse
	err := h.pool.QueryRow(
		r.Context(),
		`INSERT INTO categorias (licenca, materia, ativa)
		 VALUES ($1, $2, $3)
		 RETURNING id::text, licenca, materia, ativa, criado_em`,
		licenca,
		materia,
		true,
	).Scan(&cat.ID, &cat.Licenca, &cat.Materia, &cat.Ativa, &cat.CriadoEm)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeJSONError(w, http.StatusConflict, "Esta categoria (licença + matéria) já existe.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao criar categoria.")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"categoria": cat,
	})
}

// ListQuestoes lista questões com filtros opcionais por categoria_id, ativa e busca no enunciado (somente ADMIN).
func (h *Handler) ListQuestoes(w http.ResponseWriter, r *http.Request) {
	query := r.URL.Query()
	categoriaID := strings.TrimSpace(query.Get("categoria_id"))
	ativaRaw := strings.TrimSpace(query.Get("ativa"))
	busca := strings.TrimSpace(query.Get("busca"))
	if busca == "" {
		busca = strings.TrimSpace(query.Get("q"))
	}

	conditions := make([]string, 0, 3)
	args := make([]any, 0, 3)

	if categoriaID != "" {
		if !isValidUUID(categoriaID) {
			writeJSONError(w, http.StatusBadRequest, "Parâmetro categoria_id inválido.")
			return
		}
		args = append(args, categoriaID)
		conditions = append(conditions, fmt.Sprintf("q.categoria_id = $%d::uuid", len(args)))
	}

	if ativaRaw != "" {
		ativaVal, err := strconv.ParseBool(ativaRaw)
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "Parâmetro ativa deve ser true ou false.")
			return
		}
		args = append(args, ativaVal)
		conditions = append(conditions, fmt.Sprintf("q.ativa = $%d", len(args)))
	}

	if busca != "" {
		args = append(args, "%"+busca+"%")
		conditions = append(conditions, fmt.Sprintf("q.enunciado ILIKE $%d", len(args)))
	}

	sqlQuery := `
		SELECT q.id::text, q.categoria_id::text, c.licenca, c.materia,
		       q.enunciado, q.alternativa_a, q.alternativa_b, q.alternativa_c, q.alternativa_d,
		       q.gabarito, q.comentario, q.ativa, q.criado_em, q.atualizado_em
		FROM questoes q
		JOIN categorias c ON c.id = q.categoria_id`

	if len(conditions) > 0 {
		sqlQuery += " WHERE " + strings.Join(conditions, " AND ")
	}
	sqlQuery += " ORDER BY q.criado_em DESC"

	rows, err := h.pool.Query(r.Context(), sqlQuery, args...)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao listar questões.")
		return
	}
	defer rows.Close()

	questoes := make([]QuestaoResponse, 0)
	for rows.Next() {
		var q QuestaoResponse
		if err := rows.Scan(
			&q.ID,
			&q.CategoriaID,
			&q.CategoriaLicenca,
			&q.CategoriaMateria,
			&q.Enunciado,
			&q.AlternativaA,
			&q.AlternativaB,
			&q.AlternativaC,
			&q.AlternativaD,
			&q.Gabarito,
			&q.Comentario,
			&q.Ativa,
			&q.CriadoEm,
			&q.AtualizadoEm,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler questões.")
			return
		}
		questoes = append(questoes, q)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar questões.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"questoes": questoes,
	})
}

// CreateQuestao cadastra uma nova questão comentada (somente ADMIN).
func (h *Handler) CreateQuestao(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req questaoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	sanitized, errMsg := validateQuestaoRequest(req)
	if errMsg != "" {
		writeJSONError(w, http.StatusBadRequest, errMsg)
		return
	}

	var q QuestaoResponse
	err := h.pool.QueryRow(
		r.Context(),
		`WITH inserted AS (
			INSERT INTO questoes (
				categoria_id, enunciado, alternativa_a, alternativa_b,
				alternativa_c, alternativa_d, gabarito, comentario, ativa
			)
			VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING id, categoria_id, enunciado, alternativa_a, alternativa_b,
			          alternativa_c, alternativa_d, gabarito, comentario, ativa, criado_em, atualizado_em
		)
		SELECT i.id::text, i.categoria_id::text, c.licenca, c.materia,
		       i.enunciado, i.alternativa_a, i.alternativa_b, i.alternativa_c, i.alternativa_d,
		       i.gabarito, i.comentario, i.ativa, i.criado_em, i.atualizado_em
		FROM inserted i
		JOIN categorias c ON c.id = i.categoria_id`,
		sanitized.CategoriaID,
		sanitized.Enunciado,
		sanitized.AlternativaA,
		sanitized.AlternativaB,
		sanitized.AlternativaC,
		sanitized.AlternativaD,
		sanitized.Gabarito,
		sanitized.Comentario,
		true,
	).Scan(
		&q.ID,
		&q.CategoriaID,
		&q.CategoriaLicenca,
		&q.CategoriaMateria,
		&q.Enunciado,
		&q.AlternativaA,
		&q.AlternativaB,
		&q.AlternativaC,
		&q.AlternativaD,
		&q.Gabarito,
		&q.Comentario,
		&q.Ativa,
		&q.CriadoEm,
		&q.AtualizadoEm,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			writeJSONError(w, http.StatusBadRequest, "Categoria informada não encontrada.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao cadastrar questão.")
		return
	}

	writeJSON(w, http.StatusCreated, map[string]any{
		"questao": q,
	})
}

// UpdateQuestao atualiza uma questão comentada existente (somente ADMIN).
func (h *Handler) UpdateQuestao(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if !isValidUUID(id) {
		writeJSONError(w, http.StatusBadRequest, "ID da questão inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req questaoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	sanitized, errMsg := validateQuestaoRequest(req)
	if errMsg != "" {
		writeJSONError(w, http.StatusBadRequest, errMsg)
		return
	}

	var q QuestaoResponse
	err := h.pool.QueryRow(
		r.Context(),
		`WITH updated AS (
			UPDATE questoes
			SET categoria_id = $1::uuid,
			    enunciado = $2,
			    alternativa_a = $3,
			    alternativa_b = $4,
			    alternativa_c = $5,
			    alternativa_d = $6,
			    gabarito = $7,
			    comentario = $8,
			    ativa = COALESCE($9::boolean, ativa),
			    atualizado_em = NOW()
			WHERE id = $10::uuid
			RETURNING id, categoria_id, enunciado, alternativa_a, alternativa_b,
			          alternativa_c, alternativa_d, gabarito, comentario, ativa, criado_em, atualizado_em
		)
		SELECT u.id::text, u.categoria_id::text, c.licenca, c.materia,
		       u.enunciado, u.alternativa_a, u.alternativa_b, u.alternativa_c, u.alternativa_d,
		       u.gabarito, u.comentario, u.ativa, u.criado_em, u.atualizado_em
		FROM updated u
		JOIN categorias c ON c.id = u.categoria_id`,
		sanitized.CategoriaID,
		sanitized.Enunciado,
		sanitized.AlternativaA,
		sanitized.AlternativaB,
		sanitized.AlternativaC,
		sanitized.AlternativaD,
		sanitized.Gabarito,
		sanitized.Comentario,
		sanitized.Ativa,
		id,
	).Scan(
		&q.ID,
		&q.CategoriaID,
		&q.CategoriaLicenca,
		&q.CategoriaMateria,
		&q.Enunciado,
		&q.AlternativaA,
		&q.AlternativaB,
		&q.AlternativaC,
		&q.AlternativaD,
		&q.Gabarito,
		&q.Comentario,
		&q.Ativa,
		&q.CriadoEm,
		&q.AtualizadoEm,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Questão não encontrada.")
			return
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23503" {
			writeJSONError(w, http.StatusBadRequest, "Categoria informada não encontrada.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao atualizar questão.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"questao": q,
	})
}

// DeleteQuestao realiza exclusão lógica (ativa = false) preservando histórico de simulados (RN-07).
func (h *Handler) DeleteQuestao(w http.ResponseWriter, r *http.Request) {
	id := strings.TrimSpace(chi.URLParam(r, "id"))
	if !isValidUUID(id) {
		writeJSONError(w, http.StatusBadRequest, "ID da questão inválido.")
		return
	}

	var deletedID string
	var ativa bool
	var atualizadoEm time.Time
	err := h.pool.QueryRow(
		r.Context(),
		`UPDATE questoes
		 SET ativa = $1, atualizado_em = NOW()
		 WHERE id = $2::uuid
		 RETURNING id::text, ativa, atualizado_em`,
		false,
		id,
	).Scan(&deletedID, &ativa, &atualizadoEm)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Questão não encontrada.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao desativar questão.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"message":       "Questão desativada com sucesso.",
		"id":            deletedID,
		"ativa":         ativa,
		"atualizado_em": atualizadoEm,
	})
}

func validateQuestaoRequest(req questaoRequest) (questaoRequest, string) {
	out := questaoRequest{
		CategoriaID:  strings.TrimSpace(req.CategoriaID),
		Enunciado:    strings.TrimSpace(req.Enunciado),
		AlternativaA: strings.TrimSpace(req.AlternativaA),
		AlternativaB: strings.TrimSpace(req.AlternativaB),
		AlternativaC: strings.TrimSpace(req.AlternativaC),
		AlternativaD: strings.TrimSpace(req.AlternativaD),
		Gabarito:     strings.ToUpper(strings.TrimSpace(req.Gabarito)),
		Comentario:   strings.TrimSpace(req.Comentario),
		Ativa:        req.Ativa,
	}

	if !isValidUUID(out.CategoriaID) {
		return out, "Selecione uma categoria válida."
	}
	if out.Enunciado == "" {
		return out, "O enunciado da questão é obrigatório."
	}
	if out.AlternativaA == "" || out.AlternativaB == "" || out.AlternativaC == "" || out.AlternativaD == "" {
		return out, "Todas as quatro alternativas (A, B, C e D) são obrigatórias."
	}
	switch out.Gabarito {
	case "A", "B", "C", "D":
	default:
		return out, "O gabarito deve ser A, B, C ou D."
	}
	if out.Comentario == "" {
		return out, "O comentário explicativo do gabarito é obrigatório."
	}

	return out, ""
}

func isValidUUID(value string) bool {
	return uuidRegex.MatchString(value)
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}
