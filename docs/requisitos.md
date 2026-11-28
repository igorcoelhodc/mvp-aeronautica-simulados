# Requisitos — Aeronáutica Simulados

## 1. Visão Geral
Plataforma web para realização de simulados voltados à aviação civil (bancas/matérias da ANAC e áreas correlatas), com cronômetro, gabarito comentado, histórico de desempenho e painel administrativo para gestão de questões.

## 2. Requisitos Funcionais (RF)

| Código | Requisito | Descrição | Origem / Justificativa |
| --- | --- | --- | --- |
| **RF-01** | Captação e Cadastro | Permitir que visitantes da landing page criem conta para gerar base de leads e alunos. | "Gerar acesso e cadastro" / "Dava pra ta convertendo". |
| **RF-02** | Autenticação e Perfis | Controlar acesso por login e senha, separando Aluno e Administrador. | Necessidade básica de área restrita e gestão. |
| **RF-03** | Banco de Questões por Banca/Matéria | Armazenar questões com enunciado, alternativas, gabarito, comentário explicativo e categoria (ex.: ATPL e demais bancas). | "questões nos bancos de dados", "ATPL também no banco de dados". |
| **RF-04** | Execução de Simulado com Cronômetro | Permitir ao aluno iniciar um simulado filtrado por categoria/matéria com contagem regressiva de tempo. | "cronômetro" como diferencial frente ao concorrente. |
| **RF-05** | Correção e Questões Comentadas | Exibir nota final, acertos/erros e a explicação detalhada de cada questão ao concluir o simulado. | "questões comentadas". |
| **RF-06** | Histórico do Aluno | Registrar simulados realizados para o aluno acompanhar sua evolução. | Derivado do uso contínuo de simulados. |
| **RF-07** | Gestão de Questões (Admin) | Permitir cadastrar, editar, filtrar e desativar questões no servidor (fora do Google Drive). | "banco de dados de questões e códigos vão ficar em outro lugar, provavelmente em servidor". |
| **RF-08** | Gestão de Pacotes de Acesso | Permitir vincular planos/pacotes ao aluno (mesmo que inicialmente liberados de forma simples ou via link de pagamento externo). | "não tem nenhum pacote a venda" / modelo do concorrente. |

## 3. Requisitos Não Funcionais (RNF)

| Código | Requisito | Descrição |
| --- | --- | --- |
| **RNF-01** | Custo Inicial Baixo | Operar com custo fixo mínimo ou gratuito no início, escalando conforme a entrada de receita. |
| **RNF-02** | Segurança | Garantir site seguro e estruturado, com senhas criptografadas, HTTPS e proteção das rotas administrativas. |
| **RNF-03** | Responsividade | Funcionar bem em celulares e computadores (o público estuda em trânsito e em casa). |
| **RNF-04** | Simplicidade de Evolução | Manter o código organizado em módulos para receber futuramente aulas, biblioteca, loja e networking sem reescrever o sistema. |

## 4. Projeto de Software (Visão Conceitual)

### 4.1. Entidades Principais do Domínio
O núcleo do software — persistido em **PostgreSQL** (`database/migrations/`) e exposto pela **API REST** (`backend/`, em Node.js ou Go) — gerencia seis conjuntos centrais de entidades:

- **Usuário (`Usuario`)**: `id`, `nome`, `email`, `senha_hash`, `perfil` (`ALUNO | ADMIN`), `status_acesso`, `criado_em`.
- **Categoria / Banca (`Categoria`)**: `id`, `nome` (ex.: `PPA`, `PCA`, `ATPL`, `IFR`, `CMS`), `materia`, `ativa`.
- **Questão (`Questao`)**: `id`, `categoria_id`, `enunciado`, `alternativas` (`A`–`D`), `gabarito`, `comentario`, `ativa`.
- **Simulado (`Simulado`)**: `id`, `usuario_id`, `categoria_id`, `iniciado_em`, `finalizado_em`, `tempo_limite`, `nota_final`, `status`.
- **Resposta do Simulado (`SimuladoResposta`)**: `id`, `simulado_id`, `questao_id`, `alternativa_marcada`, `correta`.
- **Pacote / Acesso (`Pacote` e `Assinatura`)**: `id`, `nome`, `valor`, `duracao_dias`, `usuario_id`, `valido_ate`.

### 4.2. Módulos Lógicos do Sistema
Organizados de forma modular no frontend (`frontend/`, HTML5 + Tailwind CDN + JS Vanilla) e na API REST (`backend/`), servidos via **Docker Compose** (PostgreSQL + API + Caddy):

- **Módulo 1 — Vitrine e Captação (Público)**: Landing page (`frontend/index.html`, publicada em `aasimulados.app`), apresentação dos diferenciais, visualização de pacotes e acesso ao formulário de cadastro (`frontend/login.html`).
- **Módulo 2 — Identidade e Acesso**: Cadastro, login (`frontend/login.html`), controle de sessão via token JWT (`frontend/js/api.js`) e verificação de permissão (`ALUNO` vs. `ADMIN` e validação de acesso a pacotes).
- **Módulo 3 — Motor de Simulados**: Seleção de banca/matéria e histórico (`frontend/dashboard.html`), sorteio de questões, controle de cronômetro regressivo (`frontend/simulado.html` e `frontend/js/simulado.js`), salvamento de respostas, cálculo de nota e exibição do gabarito comentado.
- **Módulo 4 — Painel Administrativo**: CRUD de categorias, questões comentadas com opção de desativação (`frontend/admin.html` e `frontend/js/admin.js`) e gestão manual/automática de liberação de pacotes no servidor.

### 4.3. Fluxo Principal do Usuário (Jornada do MVP)
1. Visitante acessa `aasimulados.app` (`frontend/index.html`) → cria conta gratuita em `frontend/login.html` (gera cadastro/lead).
2. Aluno faz login → escolhe a banca/matéria em `frontend/dashboard.html` → inicia simulado com cronômetro regressivo em `frontend/simulado.html`.
3. Aluno responde às questões e finaliza (ou o tempo acaba) → sistema corrige, registra no histórico e exibe nota + questões comentadas.
4. Quando o aluno atinge o limite do plano gratuito (ou quer acesso completo), visualiza a oferta de pacote para liberar o banco completo.

## 5. Diretrizes de Identidade Visual
Todas as páginas do frontend devem seguir rigorosamente a identidade visual de `frontend/index.html`:
- **Cores**: `primary` (`#1E88E5`), `secondary` (`#00E5FF`), `accent` (`#FF6D00`), `cloud` (`#FAFAFA`) e `carbon` (`#2C3E50`).
- **Tipografia e ícones**: `Poppins` (títulos), `Inter` (textos) e Phosphor Icons.
- **Sombras**: `shadow-glass` e `shadow-glow`.
- **Classes compartilhadas (`frontend/css/theme.css`)**: `.glass`, `.glass-dark`, `.nav-chart` (cartas SVG animadas no fundo) e `.blob`.
