-- 002_seed.sql
-- Dados iniciais de exemplo para testes locais (2 categorias e 5 questões comentadas)
-- Segurança: nenhum usuário ou senha é inserido via SQL.

-- 1. Categorias de exemplo (2 categorias)
INSERT INTO categorias (id, licenca, materia, ativa)
VALUES
    ('11111111-1111-4111-8111-111111111101', 'PPA', 'Navegação Aérea', TRUE),
    ('11111111-1111-4111-8111-111111111102', 'PPA', 'Meteorologia Aeronáutica', TRUE)
ON CONFLICT (licenca, materia) DO NOTHING;

-- 2. Questões comentadas de exemplo (5 questões)
INSERT INTO questoes (
    id,
    categoria_id,
    enunciado,
    alternativa_a,
    alternativa_b,
    alternativa_c,
    alternativa_d,
    gabarito,
    comentario,
    ativa
)
VALUES
    (
        '22222222-2222-4222-8222-222222222201',
        (SELECT id FROM categorias WHERE licenca = 'PPA' AND materia = 'Navegação Aérea'),
        'Qual é o ângulo formado entre o Norte Verdadeiro (NV) e o Norte Magnético (NM)?',
        'Desvio de Bússola (DB)',
        'Declinação Magnética (DMG)',
        'Ângulo de Deriva (AD)',
        'Ângulo de Correção de Deriva (ACD)',
        'B',
        'A Declinação Magnética (DMG) é o ângulo horizontal entre o Norte Verdadeiro (NV) e o Norte Magnético (NM), podendo ser Leste (E) ou Oeste (W).',
        TRUE
    ),
    (
        '22222222-2222-4222-8222-222222222202',
        (SELECT id FROM categorias WHERE licenca = 'PPA' AND materia = 'Navegação Aérea'),
        'Uma aeronave mantém proa magnética (PM) de 090° em uma região onde a declinação magnética (DMG) é de 20°W. Qual é a proa verdadeira (PV)?',
        '070°',
        '110°',
        '090°',
        '050°',
        'A',
        'Para converter de Magnético para Verdadeiro, aplica-se a regra: DMG Oeste (W) subtrai e DMG Leste (E) soma. Portanto, PV = 090° - 20° = 070°.',
        TRUE
    ),
    (
        '22222222-2222-4222-8222-222222222203',
        (SELECT id FROM categorias WHERE licenca = 'PPA' AND materia = 'Navegação Aérea'),
        'Qual o principal efeito do vento de través durante a aproximação final e o pouso?',
        'Aumento direto da sustentação nas asas.',
        'Desvio lateral da trajetória ideal em relação ao eixo da pista.',
        'Redução brusca do arrasto induzido.',
        'Diminuição da velocidade de estol indicada.',
        'B',
        'O vento de través empurra a aeronave lateralmente, causando deriva e exigindo correção (caranguejamento ou glissada) para manter o alinhamento com o eixo da pista.',
        TRUE
    ),
    (
        '22222222-2222-4222-8222-222222222204',
        (SELECT id FROM categorias WHERE licenca = 'PPA' AND materia = 'Meteorologia Aeronáutica'),
        'Na Atmosfera Padrão (ISA), qual é a temperatura e a pressão ao nível médio do mar (MSL)?',
        '20 °C e 1013,25 hPa',
        '15 °C e 1013,25 hPa',
        '15 °C e 1000,00 hPa',
        '0 °C e 1013,25 hPa',
        'B',
        'A Atmosfera Padrão Internacional (ISA) define ao nível médio do mar temperatura de 15 °C, pressão de 1013,25 hPa (29,92 inHg) e gradiente térmico vertical de -2 °C a cada 1.000 pés na troposfera.',
        TRUE
    ),
    (
        '22222222-2222-4222-8222-222222222205',
        (SELECT id FROM categorias WHERE licenca = 'PPA' AND materia = 'Meteorologia Aeronáutica'),
        'Qual gênero de nuvem está diretamente associado a trovoadas, turbulência severa, granizo e tesoura de vento (windshear)?',
        'Cirrus (CI)',
        'Stratus (ST)',
        'Cumulonimbus (CB)',
        'Altostratus (AS)',
        'C',
        'A nuvem Cumulonimbus (CB) possui grande desenvolvimento vertical e fortes correntes convectivas, representando o fenômeno meteorológico mais perigoso para a aviação.',
        TRUE
    )
ON CONFLICT (id) DO NOTHING;
