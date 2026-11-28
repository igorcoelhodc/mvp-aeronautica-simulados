package analytics

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type KPIsResumo struct {
	OnlineAgora               int     `json:"online_agora"`
	SessoesHoje               int     `json:"sessoes_hoje"`
	UsuariosAutenticadosHoje  int     `json:"usuarios_autenticados_hoje"`
	DuracaoMediaSegundos      float64 `json:"duracao_media_segundos"`
	MediaPaginasSessao        float64 `json:"media_paginas_sessao"`
}

type SerieDiariaItem struct {
	Dia                        string  `json:"dia"`
	TotalSessoes               int     `json:"total_sessoes"`
	VisitantesUnicosIP         int     `json:"visitantes_unicos_ip"`
	UsuariosAutenticadosUnicos int     `json:"usuarios_autenticados_unicos"`
	TotalPaginasVistas         int     `json:"total_paginas_vistas"`
	DuracaoMediaSegundos       float64 `json:"duracao_media_segundos"`
}

type DispositivoItem struct {
	DispositivoTipo string `json:"dispositivo_tipo"`
	TotalSessoes    int    `json:"total_sessoes"`
}

type LocalidadeItem struct {
	Pais         string `json:"pais"`
	Regiao       string `json:"regiao"`
	Cidade       string `json:"cidade"`
	TotalSessoes int    `json:"total_sessoes"`
}

type PaginaTopItem struct {
	Pagina       string `json:"pagina"`
	TotalAcessos int    `json:"total_acessos"`
}

// GetResumo retorna o painel consolidado de métricas analíticas (somente ADMIN).
// Aceita ?dias=N (entre 1 e 90, padrão 7).
func (h *Handler) GetResumo(w http.ResponseWriter, r *http.Request) {
	dias := 7
	if raw := strings.TrimSpace(r.URL.Query().Get("dias")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed < 1 || parsed > 90 {
			writeAnalyticsError(w, http.StatusBadRequest, "Parâmetro dias deve ser um inteiro entre 1 e 90.")
			return
		}
		dias = parsed
	}

	ctx := r.Context()

	var kpis KPIsResumo

	// 1. Online agora (últimos 90 segundos) + hoje (fuso America/Sao_Paulo)
	if err := h.pool.QueryRow(
		ctx,
		`SELECT
			COUNT(CASE WHEN ultimo_evento_em >= NOW() - INTERVAL '90 seconds' THEN 1 END)::int AS online_agora,
			COUNT(CASE WHEN DATE(iniciado_em AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo') THEN 1 END)::int AS sessoes_hoje,
			COUNT(DISTINCT CASE WHEN DATE(iniciado_em AT TIME ZONE 'America/Sao_Paulo') = DATE(NOW() AT TIME ZONE 'America/Sao_Paulo') THEN usuario_id END)::int AS usuarios_autenticados_hoje
		 FROM analytics.sessoes_acesso`,
	).Scan(&kpis.OnlineAgora, &kpis.SessoesHoje, &kpis.UsuariosAutenticadosHoje); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao calcular KPIs de acesso.")
		return
	}

	// 2. Duração média e páginas médias por sessão no período selecionado
	if err := h.pool.QueryRow(
		ctx,
		`SELECT
			COALESCE(ROUND(AVG(duracao_segundos)::NUMERIC, 1), 0)::float8,
			COALESCE(ROUND(AVG(total_paginas)::NUMERIC, 2), 0)::float8
		 FROM analytics.sessoes_acesso
		 WHERE iniciado_em >= NOW() - make_interval(days => $1)`,
		dias,
	).Scan(&kpis.DuracaoMediaSegundos, &kpis.MediaPaginasSessao); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao calcular médias do período.")
		return
	}

	// 3. Série diária a partir da view analytics.vw_resumo_diario (ordem cronológica)
	serieDiaria := make([]SerieDiariaItem, 0)
	serieRows, err := h.pool.Query(
		ctx,
		`SELECT
			dia::text,
			total_sessoes::int,
			visitantes_unicos_ip::int,
			usuarios_autenticados_unicos::int,
			total_paginas_vistas::int,
			duracao_media_segundos::float8
		 FROM analytics.vw_resumo_diario
		 WHERE dia >= DATE((NOW() - make_interval(days => $1)) AT TIME ZONE 'America/Sao_Paulo')
		 ORDER BY dia ASC`,
		dias-1,
	)
	if err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao consultar série diária.")
		return
	}
	defer serieRows.Close()

	for serieRows.Next() {
		var item SerieDiariaItem
		if err := serieRows.Scan(
			&item.Dia,
			&item.TotalSessoes,
			&item.VisitantesUnicosIP,
			&item.UsuariosAutenticadosUnicos,
			&item.TotalPaginasVistas,
			&item.DuracaoMediaSegundos,
		); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao ler série diária.")
			return
		}
		serieDiaria = append(serieDiaria, item)
	}
	if err := serieRows.Err(); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao processar série diária.")
		return
	}

	// 4. Distribuição por dispositivo no período
	dispositivos := make([]DispositivoItem, 0)
	dispRows, err := h.pool.Query(
		ctx,
		`SELECT dispositivo_tipo, COUNT(*)::int AS total_sessoes
		 FROM analytics.sessoes_acesso
		 WHERE iniciado_em >= NOW() - make_interval(days => $1)
		 GROUP BY dispositivo_tipo
		 ORDER BY total_sessoes DESC`,
		dias,
	)
	if err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao consultar distribuição de dispositivos.")
		return
	}
	defer dispRows.Close()

	for dispRows.Next() {
		var item DispositivoItem
		if err := dispRows.Scan(&item.DispositivoTipo, &item.TotalSessoes); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao ler dispositivos.")
			return
		}
		dispositivos = append(dispositivos, item)
	}
	if err := dispRows.Err(); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao processar dispositivos.")
		return
	}

	// 5. Top 10 localidades no período
	localidades := make([]LocalidadeItem, 0)
	locRows, err := h.pool.Query(
		ctx,
		`SELECT
			COALESCE(NULLIF(pais, ''), 'Desconhecido') AS pais,
			COALESCE(NULLIF(regiao, ''), 'Desconhecida') AS regiao,
			COALESCE(NULLIF(cidade, ''), 'Desconhecida') AS cidade,
			COUNT(*)::int AS total_sessoes
		 FROM analytics.sessoes_acesso
		 WHERE iniciado_em >= NOW() - make_interval(days => $1)
		 GROUP BY
			COALESCE(NULLIF(pais, ''), 'Desconhecido'),
			COALESCE(NULLIF(regiao, ''), 'Desconhecida'),
			COALESCE(NULLIF(cidade, ''), 'Desconhecida')
		 ORDER BY total_sessoes DESC
		 LIMIT 10`,
		dias,
	)
	if err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao consultar localidades.")
		return
	}
	defer locRows.Close()

	for locRows.Next() {
		var item LocalidadeItem
		if err := locRows.Scan(&item.Pais, &item.Regiao, &item.Cidade, &item.TotalSessoes); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao ler localidades.")
			return
		}
		localidades = append(localidades, item)
	}
	if err := locRows.Err(); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao processar localidades.")
		return
	}

	// 6. Top 10 páginas mais acessadas em analytics.eventos_pagina no período
	paginasTop := make([]PaginaTopItem, 0)
	pagRows, err := h.pool.Query(
		ctx,
		`SELECT pagina, COUNT(*)::int AS total_acessos
		 FROM analytics.eventos_pagina
		 WHERE ocorrido_em >= NOW() - make_interval(days => $1)
		 GROUP BY pagina
		 ORDER BY total_acessos DESC
		 LIMIT 10`,
		dias,
	)
	if err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao consultar páginas mais acessadas.")
		return
	}
	defer pagRows.Close()

	for pagRows.Next() {
		var item PaginaTopItem
		if err := pagRows.Scan(&item.Pagina, &item.TotalAcessos); err != nil {
			writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao ler páginas mais acessadas.")
			return
		}
		paginasTop = append(paginasTop, item)
	}
	if err := pagRows.Err(); err != nil {
		writeAnalyticsError(w, http.StatusInternalServerError, "Erro ao processar páginas mais acessadas.")
		return
	}

	writeAnalyticsJSON(w, http.StatusOK, map[string]any{
		"dias":         dias,
		"kpis":         kpis,
		"serie_diaria": serieDiaria,
		"dispositivos": dispositivos,
		"localidades":  localidades,
		"paginas_top":  paginasTop,
	})
}

func writeAnalyticsJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeAnalyticsError(w http.ResponseWriter, status int, message string) {
	writeAnalyticsJSON(w, status, map[string]string{"error": message})
}
