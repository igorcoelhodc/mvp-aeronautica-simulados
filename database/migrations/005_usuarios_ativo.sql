-- 005_usuarios_ativo.sql
-- Adiciona controle de acesso ativo/inativo para usuários.
-- Usuários já cadastrados permanecem ativos (DEFAULT TRUE); novos cadastros via /api/auth/register gravam ativo = FALSE explicitamente.

ALTER TABLE public.usuarios
    ADD COLUMN IF NOT EXISTS ativo BOOLEAN NOT NULL DEFAULT TRUE;
