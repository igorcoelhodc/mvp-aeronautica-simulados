CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Usuários (Alunos e Administradores)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome VARCHAR(120) NOT NULL,
    email VARCHAR(160) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    perfil VARCHAR(20) NOT NULL DEFAULT 'ALUNO' CHECK (perfil IN ('ALUNO', 'ADMIN')),
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Categorias (Licença + Matéria, ex.: PPA / Navegação)
CREATE TABLE IF NOT EXISTS categorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    licenca VARCHAR(20) NOT NULL, -- PPA, PCA, PPH, PCH, PLA/ATPL, CT, AVI, GMP, CEL
    materia VARCHAR(120) NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (licenca, materia)
);

-- 3. Banco de Questões Comentadas
CREATE TABLE IF NOT EXISTS questoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    categoria_id UUID NOT NULL REFERENCES categorias(id),
    enunciado TEXT NOT NULL,
    alternativa_a TEXT NOT NULL,
    alternativa_b TEXT NOT NULL,
    alternativa_c TEXT NOT NULL,
    alternativa_d TEXT NOT NULL,
    gabarito CHAR(1) NOT NULL CHECK (gabarito IN ('A', 'B', 'C', 'D')),
    comentario TEXT NOT NULL,
    ativa BOOLEAN NOT NULL DEFAULT TRUE, -- Soft delete (RN-07)
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Simulados Realizados
CREATE TABLE IF NOT EXISTS simulados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID NOT NULL REFERENCES usuarios(id),
    categoria_id UUID NOT NULL REFERENCES categorias(id),
    iniciado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizado_em TIMESTAMPTZ,
    tempo_limite_minutos INT NOT NULL DEFAULT 30,
    total_questoes INT NOT NULL,
    acertos INT,
    nota_percentual NUMERIC(5,2),
    aprovado BOOLEAN,
    status VARCHAR(20) NOT NULL DEFAULT 'EM_ANDAMENTO' CHECK (status IN ('EM_ANDAMENTO', 'FINALIZADO'))
);

-- 5. Respostas de cada Simulado
CREATE TABLE IF NOT EXISTS simulado_respostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulado_id UUID NOT NULL REFERENCES simulados(id) ON DELETE CASCADE,
    questao_id UUID NOT NULL REFERENCES questoes(id),
    alternativa_marcada CHAR(1) CHECK (alternativa_marcada IN ('A', 'B', 'C', 'D')),
    correta BOOLEAN,
    UNIQUE (simulado_id, questao_id)
);

-- Índices essenciais para performance das consultas do MVP
CREATE INDEX IF NOT EXISTS idx_questoes_categoria_ativa ON questoes (categoria_id) WHERE ativa = TRUE;
CREATE INDEX IF NOT EXISTS idx_simulados_usuario ON simulados (usuario_id, iniciado_em DESC);
