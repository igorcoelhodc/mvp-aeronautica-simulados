package simulado

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"regexp"
	"strings"
	"time"

	"aeronautica-simulados/backend/internal/auth"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	defaultMaxQuestoes        = 20
	defaultTempoLimiteMinutos = 30
	notaMinimaAprovacao       = 70.0
)

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Handler struct {
	pool *pgxpool.Pool
}

func NewHandler(pool *pgxpool.Pool) *Handler {
	return &Handler{pool: pool}
}

type createSimuladoRequest struct {
	CategoriaID string `json:"categoria_id"`
}

type finalizeSimuladoRequest struct {
	Respostas map[string]string `json:"respostas"`
}

type SimuladoSummary struct {
	ID                    string     `json:"id"`
	CategoriaID           string     `json:"categoria_id"`
	CategoriaLicenca      string     `json:"categoria_licenca"`
	CategoriaMateria      string     `json:"categoria_materia"`
	IniciadoEm            time.Time  `json:"iniciado_em"`
	FinalizadoEm          *time.Time `json:"finalizado_em,omitempty"`
	TempoLimiteMinutos    int        `json:"tempo_limite_minutos"`
	TempoRestanteSegundos *int       `json:"tempo_restante_segundos,omitempty"`
	TotalQuestoes         int        `json:"total_questoes"`
	Acertos               *int       `json:"acertos,omitempty"`
	NotaPercentual        *float64   `json:"nota_percentual,omitempty"`
	Aprovado              *bool      `json:"aprovado,omitempty"`
	Status                string     `json:"status"`
}

// QuestaoExecucao representa uma questão durante o simulado EM_ANDAMENTO
// (regra anti-cola: nunca expõe gabarito, comentario ou comentario_imagem_url).
type QuestaoExecucao struct {
	ID                    string  `json:"id"`
	Enunciado             string  `json:"enunciado"`
	EnunciadoImagemURL    *string `json:"enunciado_imagem_url"`
	AlternativaA          string  `json:"alternativa_a"`
	AlternativaAImagemURL *string `json:"alternativa_a_imagem_url"`
	AlternativaB          string  `json:"alternativa_b"`
	AlternativaBImagemURL *string `json:"alternativa_b_imagem_url"`
	AlternativaC          string  `json:"alternativa_c"`
	AlternativaCImagemURL *string `json:"alternativa_c_imagem_url"`
	AlternativaD          string  `json:"alternativa_d"`
	AlternativaDImagemURL *string `json:"alternativa_d_imagem_url"`
	AlternativaMarcada    *string `json:"alternativa_marcada"`
}

// QuestaoRevisao representa uma questão após FINALIZADO (inclui gabarito oficial, comentário e imagem do comentário).
type QuestaoRevisao struct {
	ID                    string  `json:"id"`
	Enunciado             string  `json:"enunciado"`
	EnunciadoImagemURL    *string `json:"enunciado_imagem_url"`
	AlternativaA          string  `json:"alternativa_a"`
	AlternativaAImagemURL *string `json:"alternativa_a_imagem_url"`
	AlternativaB          string  `json:"alternativa_b"`
	AlternativaBImagemURL *string `json:"alternativa_b_imagem_url"`
	AlternativaC          string  `json:"alternativa_c"`
	AlternativaCImagemURL *string `json:"alternativa_c_imagem_url"`
	AlternativaD          string  `json:"alternativa_d"`
	AlternativaDImagemURL *string `json:"alternativa_d_imagem_url"`
	AlternativaMarcada    *string `json:"alternativa_marcada"`
	Gabarito              string  `json:"gabarito"`
	Correta               bool    `json:"correta"`
	Comentario            string  `json:"comentario"`
	ComentarioImagemURL   *string `json:"comentario_imagem_url"`
}

type ResumoGeral struct {
	TotalSimulados int     `json:"total_simulados"`
	Finalizados    int     `json:"finalizados"`
	Aprovacoes     int     `json:"aprovacoes"`
	MediaGeral     float64 `json:"media_geral"`
}

type ResumoCategoria struct {
	CategoriaID     string  `json:"categoria_id"`
	Licenca         string  `json:"licenca"`
	Materia         string  `json:"materia"`
	TotalSimulados  int     `json:"total_simulados"`
	Aprovacoes      int     `json:"aprovacoes"`
	MediaPercentual float64 `json:"media_percentual"`
}

// Create inicia um novo simulado sorteando até 20 questões ativas aleatórias sem repetição.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req createSimuladoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}

	categoriaID := strings.TrimSpace(req.CategoriaID)
	if !isValidUUID(categoriaID) {
		writeJSONError(w, http.StatusBadRequest, "Selecione uma categoria válida.")
		return
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao iniciar transação do simulado.")
		return
	}
	defer tx.Rollback(ctx)

	var licenca, materia string
	err = tx.QueryRow(
		ctx,
		`SELECT licenca, materia
		 FROM categorias
		 WHERE id = $1::uuid AND ativa = $2`,
		categoriaID,
		true,
	).Scan(&licenca, &materia)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Categoria não encontrada ou inativa.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao validar categoria.")
		return
	}

	rows, err := tx.Query(
		ctx,
		`SELECT id::text, enunciado, enunciado_imagem_url,
		        alternativa_a, alternativa_a_imagem_url,
		        alternativa_b, alternativa_b_imagem_url,
		        alternativa_c, alternativa_c_imagem_url,
		        alternativa_d, alternativa_d_imagem_url
		 FROM questoes
		 WHERE categoria_id = $1::uuid AND ativa = $2
		 ORDER BY RANDOM()
		 LIMIT $3`,
		categoriaID,
		true,
		defaultMaxQuestoes,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao sortear questões para o simulado.")
		return
	}

	questoes := make([]QuestaoExecucao, 0, defaultMaxQuestoes)
	for rows.Next() {
		var q QuestaoExecucao
		if err := rows.Scan(
			&q.ID,
			&q.Enunciado,
			&q.EnunciadoImagemURL,
			&q.AlternativaA,
			&q.AlternativaAImagemURL,
			&q.AlternativaB,
			&q.AlternativaBImagemURL,
			&q.AlternativaC,
			&q.AlternativaCImagemURL,
			&q.AlternativaD,
			&q.AlternativaDImagemURL,
		); err != nil {
			rows.Close()
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler questões sorteadas.")
			return
		}
		questoes = append(questoes, q)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar questões sorteadas.")
		return
	}
	rows.Close()

	if len(questoes) == 0 {
		writeJSONError(w, http.StatusBadRequest, "Esta categoria ainda não possui questões ativas cadastradas.")
		return
	}

	var sim SimuladoSummary
	sim.CategoriaID = categoriaID
	sim.CategoriaLicenca = licenca
	sim.CategoriaMateria = materia

	err = tx.QueryRow(
		ctx,
		`INSERT INTO simulados (usuario_id, categoria_id, tempo_limite_minutos, total_questoes, status)
		 VALUES ($1::uuid, $2::uuid, $3, $4, $5)
		 RETURNING id::text, iniciado_em, tempo_limite_minutos, total_questoes, status`,
		claims.Subject,
		categoriaID,
		defaultTempoLimiteMinutos,
		len(questoes),
		"EM_ANDAMENTO",
	).Scan(&sim.ID, &sim.IniciadoEm, &sim.TempoLimiteMinutos, &sim.TotalQuestoes, &sim.Status)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao criar simulado.")
		return
	}

	for _, q := range questoes {
		if _, err := tx.Exec(
			ctx,
			`INSERT INTO simulado_respostas (simulado_id, questao_id)
			 VALUES ($1::uuid, $2::uuid)`,
			sim.ID,
			q.ID,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao registrar questões do simulado.")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao salvar simulado.")
		return
	}

	restante := calcTempoRestanteSegundos(sim.IniciadoEm, sim.TempoLimiteMinutos)
	sim.TempoRestanteSegundos = &restante

	resp := map[string]any{
		"simulado": sim,
		"questoes": questoes,
	}
	if len(questoes) < defaultMaxQuestoes {
		resp["aviso"] = fmt.Sprintf(
			"Esta categoria possui %d %s ativas disponíveis (padrão: %d). O simulado foi gerado com o total disponível.",
			len(questoes),
			pluralQuestao(len(questoes)),
			defaultMaxQuestoes,
		)
	}

	writeJSON(w, http.StatusCreated, resp)
}

// Finalize corrige e finaliza um simulado EM_ANDAMENTO do usuário logado, retornando nota e gabarito comentado.
func (h *Handler) Finalize(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	simuladoID := strings.TrimSpace(chi.URLParam(r, "id"))
	if !isValidUUID(simuladoID) {
		writeJSONError(w, http.StatusBadRequest, "ID do simulado inválido.")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)

	var req finalizeSimuladoRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSONError(w, http.StatusBadRequest, "Corpo JSON inválido.")
		return
	}
	if req.Respostas == nil {
		req.Respostas = make(map[string]string)
	}

	ctx := r.Context()
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao iniciar transação de correção.")
		return
	}
	defer tx.Rollback(ctx)

	var sim SimuladoSummary
	var ownerID string
	err = tx.QueryRow(
		ctx,
		`SELECT s.id::text, s.usuario_id::text, s.categoria_id::text, c.licenca, c.materia,
		        s.iniciado_em, s.tempo_limite_minutos, s.total_questoes, s.status
		 FROM simulados s
		 JOIN categorias c ON c.id = s.categoria_id
		 WHERE s.id = $1::uuid
		 FOR UPDATE OF s`,
		simuladoID,
	).Scan(
		&sim.ID,
		&ownerID,
		&sim.CategoriaID,
		&sim.CategoriaLicenca,
		&sim.CategoriaMateria,
		&sim.IniciadoEm,
		&sim.TempoLimiteMinutos,
		&sim.TotalQuestoes,
		&sim.Status,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Simulado não encontrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar simulado.")
		return
	}

	if ownerID != claims.Subject {
		writeJSONError(w, http.StatusForbidden, "Você não tem permissão para finalizar este simulado.")
		return
	}
	if sim.Status != "EM_ANDAMENTO" {
		writeJSONError(w, http.StatusConflict, "Este simulado já foi finalizado.")
		return
	}

	type respostaItem struct {
		RespostaID            string
		QuestaoID             string
		Enunciado             string
		EnunciadoImagemURL    *string
		AlternativaA          string
		AlternativaAImagemURL *string
		AlternativaB          string
		AlternativaBImagemURL *string
		AlternativaC          string
		AlternativaCImagemURL *string
		AlternativaD          string
		AlternativaDImagemURL *string
		Gabarito              string
		Comentario            string
		ComentarioImagemURL   *string
	}

	rows, err := tx.Query(
		ctx,
		`SELECT sr.id::text, q.id::text, q.enunciado, q.enunciado_imagem_url,
		        q.alternativa_a, q.alternativa_a_imagem_url,
		        q.alternativa_b, q.alternativa_b_imagem_url,
		        q.alternativa_c, q.alternativa_c_imagem_url,
		        q.alternativa_d, q.alternativa_d_imagem_url,
		        TRIM(q.gabarito), q.comentario, q.comentario_imagem_url
		 FROM simulado_respostas sr
		 JOIN questoes q ON q.id = sr.questao_id
		 WHERE sr.simulado_id = $1::uuid
		 ORDER BY sr.id ASC`,
		simuladoID,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao carregar questões do simulado.")
		return
	}

	items := make([]respostaItem, 0, sim.TotalQuestoes)
	for rows.Next() {
		var it respostaItem
		if err := rows.Scan(
			&it.RespostaID,
			&it.QuestaoID,
			&it.Enunciado,
			&it.EnunciadoImagemURL,
			&it.AlternativaA,
			&it.AlternativaAImagemURL,
			&it.AlternativaB,
			&it.AlternativaBImagemURL,
			&it.AlternativaC,
			&it.AlternativaCImagemURL,
			&it.AlternativaD,
			&it.AlternativaDImagemURL,
			&it.Gabarito,
			&it.Comentario,
			&it.ComentarioImagemURL,
		); err != nil {
			rows.Close()
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler questões do simulado.")
			return
		}
		items = append(items, it)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar questões do simulado.")
		return
	}
	rows.Close()

	acertos := 0
	revisao := make([]QuestaoRevisao, 0, len(items))

	for _, it := range items {
		marcada := normalizeAlternativa(req.Respostas[it.QuestaoID])
		correta := marcada != nil && *marcada == it.Gabarito
		if correta {
			acertos++
		}

		if _, err := tx.Exec(
			ctx,
			`UPDATE simulado_respostas
			 SET alternativa_marcada = $1, correta = $2
			 WHERE id = $3::uuid`,
			marcada,
			correta,
			it.RespostaID,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao registrar respostas do simulado.")
			return
		}

		revisao = append(revisao, QuestaoRevisao{
			ID:                    it.QuestaoID,
			Enunciado:             it.Enunciado,
			EnunciadoImagemURL:    it.EnunciadoImagemURL,
			AlternativaA:          it.AlternativaA,
			AlternativaAImagemURL: it.AlternativaAImagemURL,
			AlternativaB:          it.AlternativaB,
			AlternativaBImagemURL: it.AlternativaBImagemURL,
			AlternativaC:          it.AlternativaC,
			AlternativaCImagemURL: it.AlternativaCImagemURL,
			AlternativaD:          it.AlternativaD,
			AlternativaDImagemURL: it.AlternativaDImagemURL,
			AlternativaMarcada:    marcada,
			Gabarito:              it.Gabarito,
			Correta:               correta,
			Comentario:            it.Comentario,
			ComentarioImagemURL:   it.ComentarioImagemURL,
		})
	}

	total := len(items)
	var notaPercentual float64
	if total > 0 {
		notaPercentual = math.Round((float64(acertos)/float64(total))*10000) / 100
	}
	aprovado := notaPercentual >= notaMinimaAprovacao

	var finalizadoEm time.Time
	err = tx.QueryRow(
		ctx,
		`UPDATE simulados
		 SET finalizado_em = NOW(),
		     acertos = $1,
		     nota_percentual = $2,
		     aprovado = $3,
		     status = $4
		 WHERE id = $5::uuid
		 RETURNING finalizado_em`,
		acertos,
		notaPercentual,
		aprovado,
		"FINALIZADO",
		simuladoID,
	).Scan(&finalizadoEm)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao finalizar simulado.")
		return
	}

	if err := tx.Commit(ctx); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao confirmar finalização do simulado.")
		return
	}

	sim.FinalizadoEm = &finalizadoEm
	sim.TotalQuestoes = total
	sim.Acertos = &acertos
	sim.NotaPercentual = &notaPercentual
	sim.Aprovado = &aprovado
	sim.Status = "FINALIZADO"

	writeJSON(w, http.StatusOK, map[string]any{
		"simulado": sim,
		"revisao":  revisao,
	})
}

// List retorna o histórico de simulados do usuário logado e resumo de média por categoria.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	ctx := r.Context()

	rows, err := h.pool.Query(
		ctx,
		`SELECT s.id::text, s.categoria_id::text, c.licenca, c.materia,
		        s.iniciado_em, s.finalizado_em, s.tempo_limite_minutos,
		        s.total_questoes, s.acertos, s.nota_percentual::float8,
		        s.aprovado, s.status
		 FROM simulados s
		 JOIN categorias c ON c.id = s.categoria_id
		 WHERE s.usuario_id = $1::uuid
		 ORDER BY s.iniciado_em DESC`,
		claims.Subject,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar histórico de simulados.")
		return
	}
	defer rows.Close()

	simulados := make([]SimuladoSummary, 0)
	var somaNotas float64
	var resumoGeral ResumoGeral

	for rows.Next() {
		var s SimuladoSummary
		if err := rows.Scan(
			&s.ID,
			&s.CategoriaID,
			&s.CategoriaLicenca,
			&s.CategoriaMateria,
			&s.IniciadoEm,
			&s.FinalizadoEm,
			&s.TempoLimiteMinutos,
			&s.TotalQuestoes,
			&s.Acertos,
			&s.NotaPercentual,
			&s.Aprovado,
			&s.Status,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler histórico de simulados.")
			return
		}

		resumoGeral.TotalSimulados++
		if s.Status == "EM_ANDAMENTO" {
			restante := calcTempoRestanteSegundos(s.IniciadoEm, s.TempoLimiteMinutos)
			s.TempoRestanteSegundos = &restante
		} else if s.Status == "FINALIZADO" {
			resumoGeral.Finalizados++
			if s.NotaPercentual != nil {
				somaNotas += *s.NotaPercentual
			}
			if s.Aprovado != nil && *s.Aprovado {
				resumoGeral.Aprovacoes++
			}
		}

		simulados = append(simulados, s)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar histórico de simulados.")
		return
	}

	if resumoGeral.Finalizados > 0 {
		resumoGeral.MediaGeral = math.Round((somaNotas/float64(resumoGeral.Finalizados))*100) / 100
	}

	catRows, err := h.pool.Query(
		ctx,
		`SELECT c.id::text, c.licenca, c.materia,
		        COUNT(s.id)::int AS total_simulados,
		        COUNT(CASE WHEN s.aprovado = TRUE THEN 1 END)::int AS aprovacoes,
		        COALESCE(ROUND(AVG(s.nota_percentual), 2), 0)::float8 AS media_percentual
		 FROM simulados s
		 JOIN categorias c ON c.id = s.categoria_id
		 WHERE s.usuario_id = $1::uuid AND s.status = $2
		 GROUP BY c.id, c.licenca, c.materia
		 ORDER BY c.licenca ASC, c.materia ASC`,
		claims.Subject,
		"FINALIZADO",
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao calcular desempenho por categoria.")
		return
	}
	defer catRows.Close()

	resumoCategorias := make([]ResumoCategoria, 0)
	for catRows.Next() {
		var rc ResumoCategoria
		if err := catRows.Scan(
			&rc.CategoriaID,
			&rc.Licenca,
			&rc.Materia,
			&rc.TotalSimulados,
			&rc.Aprovacoes,
			&rc.MediaPercentual,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler desempenho por categoria.")
			return
		}
		resumoCategorias = append(resumoCategorias, rc)
	}
	if err := catRows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar desempenho por categoria.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"simulados":            simulados,
		"resumo_geral":         resumoGeral,
		"resumo_por_categoria": resumoCategorias,
	})
}

// GetByID retorna detalhes do simulado (sem gabarito/comentário se EM_ANDAMENTO; com gabarito comentado se FINALIZADO).
func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	claims, ok := auth.ClaimsFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "Usuário não autenticado.")
		return
	}

	simuladoID := strings.TrimSpace(chi.URLParam(r, "id"))
	if !isValidUUID(simuladoID) {
		writeJSONError(w, http.StatusBadRequest, "ID do simulado inválido.")
		return
	}

	ctx := r.Context()

	var sim SimuladoSummary
	var ownerID string
	err := h.pool.QueryRow(
		ctx,
		`SELECT s.id::text, s.usuario_id::text, s.categoria_id::text, c.licenca, c.materia,
		        s.iniciado_em, s.finalizado_em, s.tempo_limite_minutos,
		        s.total_questoes, s.acertos, s.nota_percentual::float8,
		        s.aprovado, s.status
		 FROM simulados s
		 JOIN categorias c ON c.id = s.categoria_id
		 WHERE s.id = $1::uuid`,
		simuladoID,
	).Scan(
		&sim.ID,
		&ownerID,
		&sim.CategoriaID,
		&sim.CategoriaLicenca,
		&sim.CategoriaMateria,
		&sim.IniciadoEm,
		&sim.FinalizadoEm,
		&sim.TempoLimiteMinutos,
		&sim.TotalQuestoes,
		&sim.Acertos,
		&sim.NotaPercentual,
		&sim.Aprovado,
		&sim.Status,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			writeJSONError(w, http.StatusNotFound, "Simulado não encontrado.")
			return
		}
		writeJSONError(w, http.StatusInternalServerError, "Erro ao consultar simulado.")
		return
	}

	if ownerID != claims.Subject {
		writeJSONError(w, http.StatusForbidden, "Você não tem permissão para acessar este simulado.")
		return
	}

	if sim.Status == "EM_ANDAMENTO" {
		rows, err := h.pool.Query(
			ctx,
			`SELECT q.id::text, q.enunciado, q.enunciado_imagem_url,
			        q.alternativa_a, q.alternativa_a_imagem_url,
			        q.alternativa_b, q.alternativa_b_imagem_url,
			        q.alternativa_c, q.alternativa_c_imagem_url,
			        q.alternativa_d, q.alternativa_d_imagem_url,
			        TRIM(sr.alternativa_marcada)
			 FROM simulado_respostas sr
			 JOIN questoes q ON q.id = sr.questao_id
			 WHERE sr.simulado_id = $1::uuid
			 ORDER BY sr.id ASC`,
			simuladoID,
		)
		if err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao carregar questões do simulado.")
			return
		}
		defer rows.Close()

		questoes := make([]QuestaoExecucao, 0, sim.TotalQuestoes)
		for rows.Next() {
			var q QuestaoExecucao
			if err := rows.Scan(
				&q.ID,
				&q.Enunciado,
				&q.EnunciadoImagemURL,
				&q.AlternativaA,
				&q.AlternativaAImagemURL,
				&q.AlternativaB,
				&q.AlternativaBImagemURL,
				&q.AlternativaC,
				&q.AlternativaCImagemURL,
				&q.AlternativaD,
				&q.AlternativaDImagemURL,
				&q.AlternativaMarcada,
			); err != nil {
				writeJSONError(w, http.StatusInternalServerError, "Erro ao ler questões do simulado.")
				return
			}
			questoes = append(questoes, q)
		}
		if err := rows.Err(); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao processar questões do simulado.")
			return
		}

		restante := calcTempoRestanteSegundos(sim.IniciadoEm, sim.TempoLimiteMinutos)
		sim.TempoRestanteSegundos = &restante

		resp := map[string]any{
			"simulado": sim,
			"questoes": questoes,
		}
		if len(questoes) < defaultMaxQuestoes {
			resp["aviso"] = fmt.Sprintf(
				"Este simulado possui %d %s (total disponível nesta categoria no momento da criação).",
				len(questoes),
				pluralQuestao(len(questoes)),
			)
		}

		writeJSON(w, http.StatusOK, resp)
		return
	}

	// Status FINALIZADO: retorna gabarito comentado completo (incluindo comentario_imagem_url)
	rows, err := h.pool.Query(
		ctx,
		`SELECT q.id::text, q.enunciado, q.enunciado_imagem_url,
		        q.alternativa_a, q.alternativa_a_imagem_url,
		        q.alternativa_b, q.alternativa_b_imagem_url,
		        q.alternativa_c, q.alternativa_c_imagem_url,
		        q.alternativa_d, q.alternativa_d_imagem_url,
		        TRIM(sr.alternativa_marcada), TRIM(q.gabarito), COALESCE(sr.correta, FALSE),
		        q.comentario, q.comentario_imagem_url
		 FROM simulado_respostas sr
		 JOIN questoes q ON q.id = sr.questao_id
		 WHERE sr.simulado_id = $1::uuid
		 ORDER BY sr.id ASC`,
		simuladoID,
	)
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao carregar revisão do simulado.")
		return
	}
	defer rows.Close()

	revisao := make([]QuestaoRevisao, 0, sim.TotalQuestoes)
	for rows.Next() {
		var q QuestaoRevisao
		if err := rows.Scan(
			&q.ID,
			&q.Enunciado,
			&q.EnunciadoImagemURL,
			&q.AlternativaA,
			&q.AlternativaAImagemURL,
			&q.AlternativaB,
			&q.AlternativaBImagemURL,
			&q.AlternativaC,
			&q.AlternativaCImagemURL,
			&q.AlternativaD,
			&q.AlternativaDImagemURL,
			&q.AlternativaMarcada,
			&q.Gabarito,
			&q.Correta,
			&q.Comentario,
			&q.ComentarioImagemURL,
		); err != nil {
			writeJSONError(w, http.StatusInternalServerError, "Erro ao ler revisão do simulado.")
			return
		}
		revisao = append(revisao, q)
	}
	if err := rows.Err(); err != nil {
		writeJSONError(w, http.StatusInternalServerError, "Erro ao processar revisão do simulado.")
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"simulado": sim,
		"revisao":  revisao,
	})
}

func normalizeAlternativa(raw string) *string {
	val := strings.ToUpper(strings.TrimSpace(raw))
	switch val {
	case "A", "B", "C", "D":
		return &val
	default:
		return nil
	}
}

func calcTempoRestanteSegundos(iniciadoEm time.Time, limiteMinutos int) int {
	deadline := iniciadoEm.Add(time.Duration(limiteMinutos) * time.Minute)
	restante := int(math.Ceil(time.Until(deadline).Seconds()))
	if restante < 0 {
		return 0
	}
	return restante
}

func pluralQuestao(n int) string {
	if n == 1 {
		return "questão"
	}
	return "questões"
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
