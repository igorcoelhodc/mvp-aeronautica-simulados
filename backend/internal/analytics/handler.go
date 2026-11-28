package analytics

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"net/url"
	"regexp"
	"strings"

	"aeronautica-simulados/backend/internal/auth"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxTelemetryBodyBytes int64 = 8 << 10 // 8 KB

var uuidRegex = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

type Handler struct {
	pool       *pgxpool.Pool
	tokens     *auth.TokenManager
	ipHashSalt string
}

func NewHandler(pool *pgxpool.Pool, tokens *auth.TokenManager, ipHashSalt string) *Handler {
	return &Handler{
		pool:       pool,
		tokens:     tokens,
		ipHashSalt: ipHashSalt,
	}
}

type telemetryEventRequest struct {
	SessionID       string `json:"session_id"`
	EventType       string `json:"event_type"`
	Pagina          string `json:"pagina"`
	FusoHorario     string `json:"fuso_horario"`
	TelaLargura     *int   `json:"tela_largura"`
	TelaAltura      *int   `json:"tela_altura"`
	ViewportLargura *int   `json:"viewport_largura"`
	ViewportAltura  *int   `json:"viewport_altura"`
}

// RecordEvent coleta eventos de telemetria (pageview, heartbeat, end) em schema analytics.
// Rota pública: associa opcionalmente o usuario_id se houver JWT Bearer válido, sem retornar 401.
func (h *Handler) RecordEvent(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxTelemetryBodyBytes)

	var req telemetryEventRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var maxBytesErr *http.MaxBytesError
		if errors.As(err, &maxBytesErr) {
			w.WriteHeader(http.StatusRequestEntityTooLarge)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	sessionID := strings.TrimSpace(req.SessionID)
	if !uuidRegex.MatchString(sessionID) {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	eventType := strings.ToLower(strings.TrimSpace(req.EventType))
	switch eventType {
	case "pageview", "heartbeat", "end":
	default:
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	pagina := sanitizePagePath(req.Pagina)
	if pagina == "" {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	usuarioID := h.extractOptionalUserID(r)
	ipHash := h.extractIPHash(r)

	pais := sanitizeHeaderValue(r.Header.Get("CF-IPCountry"), 16)
	regiao := sanitizeHeaderValue(r.Header.Get("CF-Region"), 120)
	cidade := sanitizeHeaderValue(r.Header.Get("CF-IPCity"), 120)
	fusoHorario := sanitizeOptionalText(req.FusoHorario, 80)

	rawUA := strings.TrimSpace(r.UserAgent())
	userAgent := sanitizeOptionalText(rawUA, 512)

	telaLargura := sanitizeDimension(req.TelaLargura)
	telaAltura := sanitizeDimension(req.TelaAltura)
	viewportLargura := sanitizeDimension(req.ViewportLargura)
	viewportAltura := sanitizeDimension(req.ViewportAltura)

	dispositivoTipo := classifyDeviceType(rawUA, telaLargura, viewportLargura)
	sistemaOperacional := classifyOS(rawUA)
	navegador := classifyBrowser(rawUA)

	ctx := r.Context()
	if err := h.persistTelemetry(
		ctx,
		sessionID,
		usuarioID,
		ipHash,
		pais,
		regiao,
		cidade,
		fusoHorario,
		dispositivoTipo,
		sistemaOperacional,
		navegador,
		userAgent,
		telaLargura,
		telaAltura,
		viewportLargura,
		viewportAltura,
		pagina,
		eventType,
	); err != nil {
		// Se o JWT referenciar um usuário já removido (FK 23503), registra de forma anônima
		var pgErr *pgconn.PgError
		if usuarioID != nil && errors.As(err, &pgErr) && pgErr.Code == "23503" {
			_ = h.persistTelemetry(
				ctx,
				sessionID,
				nil,
				ipHash,
				pais,
				regiao,
				cidade,
				fusoHorario,
				dispositivoTipo,
				sistemaOperacional,
				navegador,
				userAgent,
				telaLargura,
				telaAltura,
				viewportLargura,
				viewportAltura,
				pagina,
				eventType,
			)
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) persistTelemetry(
	ctx context.Context,
	sessionID string,
	usuarioID *string,
	ipHash *string,
	pais *string,
	regiao *string,
	cidade *string,
	fusoHorario *string,
	dispositivoTipo string,
	sistemaOperacional *string,
	navegador *string,
	userAgent *string,
	telaLargura *int,
	telaAltura *int,
	viewportLargura *int,
	viewportAltura *int,
	pagina string,
	eventType string,
) error {
	_, err := h.pool.Exec(
		ctx,
		`INSERT INTO analytics.sessoes_acesso (
			id, usuario_id, ip_hash, pais, regiao, cidade, fuso_horario,
			dispositivo_tipo, sistema_operacional, navegador, user_agent,
			tela_largura, tela_altura, viewport_largura, viewport_altura,
			pagina_entrada, ultima_pagina, total_paginas,
			iniciado_em, ultimo_evento_em, duracao_segundos
		)
		VALUES (
			$1::uuid, $2::uuid, $3, $4, $5, $6, $7,
			$8, $9, $10, $11,
			$12, $13, $14, $15,
			$16, $16, 1,
			NOW(), NOW(), 0
		)
		ON CONFLICT (id) DO UPDATE SET
			usuario_id = COALESCE(EXCLUDED.usuario_id, analytics.sessoes_acesso.usuario_id),
			ultima_pagina = CASE
				WHEN $17 = 'pageview' THEN EXCLUDED.ultima_pagina
				ELSE analytics.sessoes_acesso.ultima_pagina
			END,
			total_paginas = analytics.sessoes_acesso.total_paginas + CASE
				WHEN $17 = 'pageview' THEN 1
				ELSE 0
			END,
			viewport_largura = COALESCE(EXCLUDED.viewport_largura, analytics.sessoes_acesso.viewport_largura),
			viewport_altura = COALESCE(EXCLUDED.viewport_altura, analytics.sessoes_acesso.viewport_altura),
			ultimo_evento_em = NOW(),
			duracao_segundos = GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (NOW() - analytics.sessoes_acesso.iniciado_em)))::INT)`,
		sessionID,
		usuarioID,
		ipHash,
		pais,
		regiao,
		cidade,
		fusoHorario,
		dispositivoTipo,
		sistemaOperacional,
		navegador,
		userAgent,
		telaLargura,
		telaAltura,
		viewportLargura,
		viewportAltura,
		pagina,
		eventType,
	)
	if err != nil {
		return err
	}

	if eventType == "pageview" {
		_, err = h.pool.Exec(
			ctx,
			`INSERT INTO analytics.eventos_pagina (sessao_id, usuario_id, pagina)
			 VALUES ($1::uuid, $2::uuid, $3)`,
			sessionID,
			usuarioID,
			pagina,
		)
		if err != nil {
			return err
		}
	}

	return nil
}

func (h *Handler) extractOptionalUserID(r *http.Request) *string {
	if h.tokens == nil {
		return nil
	}
	authHeader := strings.TrimSpace(r.Header.Get("Authorization"))
	if authHeader == "" {
		return nil
	}
	parts := strings.SplitN(authHeader, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return nil
	}
	tokenStr := strings.TrimSpace(parts[1])
	if tokenStr == "" {
		return nil
	}
	claims, err := h.tokens.Parse(tokenStr)
	if err != nil || !uuidRegex.MatchString(claims.Subject) {
		return nil
	}
	uid := claims.Subject
	return &uid
}

func (h *Handler) extractIPHash(r *http.Request) *string {
	rawIP := strings.TrimSpace(r.Header.Get("CF-Connecting-IP"))
	if rawIP == "" {
		if xff := strings.TrimSpace(r.Header.Get("X-Forwarded-For")); xff != "" {
			rawIP = strings.TrimSpace(strings.Split(xff, ",")[0])
		}
	}
	if rawIP == "" {
		host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
		if err == nil {
			rawIP = host
		} else {
			rawIP = strings.TrimSpace(r.RemoteAddr)
		}
	}
	if rawIP == "" {
		return nil
	}

	sum := sha256.Sum256([]byte(h.ipHashSalt + ":" + rawIP))
	encoded := hex.EncodeToString(sum[:])
	return &encoded
}

func sanitizePagePath(raw string) string {
	p := strings.TrimSpace(raw)
	if p == "" {
		return ""
	}
	if idx := strings.IndexAny(p, "?#"); idx >= 0 {
		p = p[:idx]
	}
	if !strings.HasPrefix(p, "/") {
		p = "/" + p
	}
	if len(p) > 200 {
		p = p[:200]
	}
	return p
}

func sanitizeHeaderValue(raw string, maxLen int) *string {
	val := strings.TrimSpace(raw)
	if val == "" || strings.EqualFold(val, "XX") || strings.EqualFold(val, "T1") {
		return nil
	}
	if decoded, err := url.PathUnescape(val); err == nil {
		val = strings.TrimSpace(decoded)
	}
	return sanitizeOptionalText(val, maxLen)
}

func sanitizeOptionalText(raw string, maxLen int) *string {
	val := strings.TrimSpace(raw)
	if val == "" {
		return nil
	}
	if len(val) > maxLen {
		val = val[:maxLen]
	}
	return &val
}

func sanitizeDimension(v *int) *int {
	if v == nil {
		return nil
	}
	if *v <= 0 || *v > 20000 {
		return nil
	}
	val := *v
	return &val
}

func classifyDeviceType(ua string, screenW *int, viewportW *int) string {
	lower := strings.ToLower(ua)

	if strings.Contains(lower, "ipad") || strings.Contains(lower, "tablet") ||
		(strings.Contains(lower, "android") && !strings.Contains(lower, "mobile")) {
		return "tablet"
	}
	if strings.Contains(lower, "mobi") || strings.Contains(lower, "iphone") ||
		strings.Contains(lower, "ipod") || strings.Contains(lower, "android") {
		return "mobile"
	}
	if strings.Contains(lower, "windows") || strings.Contains(lower, "macintosh") ||
		strings.Contains(lower, "linux") || strings.Contains(lower, "cros") {
		return "desktop"
	}

	width := 0
	if viewportW != nil && *viewportW > 0 {
		width = *viewportW
	} else if screenW != nil && *screenW > 0 {
		width = *screenW
	}
	if width > 0 {
		if width < 768 {
			return "mobile"
		}
		if width < 1024 {
			return "tablet"
		}
		return "desktop"
	}

	return "desconhecido"
}

func classifyOS(ua string) *string {
	lower := strings.ToLower(ua)
	var osName string
	switch {
	case strings.Contains(lower, "iphone") || strings.Contains(lower, "ipad") || strings.Contains(lower, "ipod"):
		osName = "iOS"
	case strings.Contains(lower, "android"):
		osName = "Android"
	case strings.Contains(lower, "windows"):
		osName = "Windows"
	case strings.Contains(lower, "mac os x") || strings.Contains(lower, "macintosh"):
		osName = "macOS"
	case strings.Contains(lower, "cros"):
		osName = "ChromeOS"
	case strings.Contains(lower, "linux"):
		osName = "Linux"
	default:
		return nil
	}
	return &osName
}

func classifyBrowser(ua string) *string {
	lower := strings.ToLower(ua)
	var browser string
	switch {
	case strings.Contains(lower, "edg/") || strings.Contains(lower, "edge/"):
		browser = "Edge"
	case strings.Contains(lower, "opr/") || strings.Contains(lower, "opera"):
		browser = "Opera"
	case strings.Contains(lower, "firefox/") || strings.Contains(lower, "fxios"):
		browser = "Firefox"
	case strings.Contains(lower, "chrome/") || strings.Contains(lower, "crios"):
		browser = "Chrome"
	case strings.Contains(lower, "safari/"):
		browser = "Safari"
	default:
		return nil
	}
	return &browser
}
