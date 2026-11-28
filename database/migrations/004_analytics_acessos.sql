-- 004_analytics_acessos.sql
-- Schema analítico isolado para telemetria de acessos e relatórios executivos (BI).
-- Não exposto no painel administrativo.

CREATE SCHEMA IF NOT EXISTS analytics;

CREATE TABLE IF NOT EXISTS analytics.sessoes_acesso (
    id UUID PRIMARY KEY,
    usuario_id UUID NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ip_hash TEXT NULL,
    pais TEXT NULL,
    regiao TEXT NULL,
    cidade TEXT NULL,
    fuso_horario TEXT NULL,
    dispositivo_tipo TEXT NOT NULL DEFAULT 'desconhecido'
        CHECK (dispositivo_tipo IN ('mobile', 'tablet', 'desktop', 'desconhecido')),
    sistema_operacional TEXT NULL,
    navegador TEXT NULL,
    user_agent TEXT NULL,
    tela_largura INT NULL,
    tela_altura INT NULL,
    viewport_largura INT NULL,
    viewport_altura INT NULL,
    pagina_entrada TEXT NOT NULL,
    ultima_pagina TEXT NOT NULL,
    total_paginas INT NOT NULL DEFAULT 1,
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ultimo_evento_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duracao_segundos INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS analytics.eventos_pagina (
    id BIGSERIAL PRIMARY KEY,
    sessao_id UUID NOT NULL REFERENCES analytics.sessoes_acesso(id) ON DELETE CASCADE,
    usuario_id UUID NULL REFERENCES public.usuarios(id) ON DELETE SET NULL,
    pagina TEXT NOT NULL,
    ocorrido_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índices para consultas analíticas e relatórios executivos
CREATE INDEX IF NOT EXISTS idx_analytics_sessoes_iniciado_em
    ON analytics.sessoes_acesso (iniciado_em DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_sessoes_usuario_id
    ON analytics.sessoes_acesso (usuario_id);

CREATE INDEX IF NOT EXISTS idx_analytics_sessoes_pais
    ON analytics.sessoes_acesso (pais);

CREATE INDEX IF NOT EXISTS idx_analytics_sessoes_dispositivo_tipo
    ON analytics.sessoes_acesso (dispositivo_tipo);

CREATE INDEX IF NOT EXISTS idx_analytics_eventos_sessao_ocorrido
    ON analytics.eventos_pagina (sessao_id, ocorrido_em DESC);

-- View 1: Resumo diário de acessos, usuários únicos e duração média de sessão
CREATE OR REPLACE VIEW analytics.vw_resumo_diario AS
SELECT
    DATE(iniciado_em AT TIME ZONE 'America/Sao_Paulo') AS dia,
    COUNT(*)::BIGINT AS total_sessoes,
    COUNT(DISTINCT ip_hash)::BIGINT AS visitantes_unicos_ip,
    COUNT(DISTINCT usuario_id)::BIGINT AS usuarios_autenticados_unicos,
    COALESCE(SUM(total_paginas), 0)::BIGINT AS total_paginas_vistas,
    COALESCE(ROUND(AVG(duracao_segundos)::NUMERIC, 2), 0)::NUMERIC(10,2) AS duracao_media_segundos
FROM analytics.sessoes_acesso
GROUP BY DATE(iniciado_em AT TIME ZONE 'America/Sao_Paulo')
ORDER BY dia DESC;

-- View 2: Agregado por localidade, tipo de dispositivo e resolução de tela
CREATE OR REPLACE VIEW analytics.vw_acessos_por_localidade_dispositivo AS
SELECT
    COALESCE(NULLIF(pais, ''), 'Desconhecido') AS pais,
    COALESCE(NULLIF(regiao, ''), 'Desconhecida') AS regiao,
    COALESCE(NULLIF(cidade, ''), 'Desconhecida') AS cidade,
    dispositivo_tipo,
    CASE
        WHEN tela_largura IS NOT NULL AND tela_altura IS NOT NULL
            THEN tela_largura::TEXT || 'x' || tela_altura::TEXT
        ELSE 'Desconhecida'
    END AS resolucao_tela,
    COUNT(*)::BIGINT AS total_sessoes,
    COUNT(DISTINCT ip_hash)::BIGINT AS visitantes_unicos_ip,
    COALESCE(ROUND(AVG(duracao_segundos)::NUMERIC, 2), 0)::NUMERIC(10,2) AS duracao_media_segundos
FROM analytics.sessoes_acesso
GROUP BY
    COALESCE(NULLIF(pais, ''), 'Desconhecido'),
    COALESCE(NULLIF(regiao, ''), 'Desconhecida'),
    COALESCE(NULLIF(cidade, ''), 'Desconhecida'),
    dispositivo_tipo,
    CASE
        WHEN tela_largura IS NOT NULL AND tela_altura IS NOT NULL
            THEN tela_largura::TEXT || 'x' || tela_altura::TEXT
        ELSE 'Desconhecida'
    END
ORDER BY total_sessoes DESC;
