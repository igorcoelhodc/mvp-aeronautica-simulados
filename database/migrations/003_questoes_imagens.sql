-- 003_questoes_imagens.sql
-- Adiciona colunas opcionais de URL de imagem para enunciado, alternativas A-D e comentário.

ALTER TABLE questoes
    ADD COLUMN IF NOT EXISTS enunciado_imagem_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS alternativa_a_imagem_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS alternativa_b_imagem_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS alternativa_c_imagem_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS alternativa_d_imagem_url TEXT NULL,
    ADD COLUMN IF NOT EXISTS comentario_imagem_url TEXT NULL;
