// dashboard.js — Painel do Aluno (Seleção de Banca/Matéria, Resumo de Desempenho e Histórico)

import { apiRequest, getToken } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('dashboard-loading');
  const contentEl = document.getElementById('dashboard-content');

  const welcomeNameEl = document.getElementById('welcome-name');

  const statSimuladosEl = document.getElementById('stat-simulados');
  const statMediaEl = document.getElementById('stat-media');
  const statAprovacoesEl = document.getElementById('stat-aprovacoes');

  const formNovoSimulado = document.getElementById('novo-simulado-form');
  const selectLicenca = document.getElementById('select-licenca');
  const selectCategoria = document.getElementById('select-categoria');
  const btnIniciar = document.getElementById('btn-iniciar-simulado');
  const btnIniciarLabel = document.getElementById('btn-iniciar-label');
  const categoriaAvisoEl = document.getElementById('categoria-aviso');
  const feedbackEl = document.getElementById('dashboard-feedback');

  const secaoDesempenho = document.getElementById('secao-desempenho');
  const resumoCategoriasGrid = document.getElementById('resumo-categorias-grid');
  const historicoCountEl = document.getElementById('historico-count');
  const historicoContainer = document.getElementById('historico-container');

  let todasCategorias = [];

  function showFeedback(message, type = 'error') {
    if (!feedbackEl) return;
    if (!message) {
      feedbackEl.classList.add('hidden');
      feedbackEl.textContent = '';
      return;
    }

    feedbackEl.textContent = message;
    feedbackEl.classList.remove(
      'hidden',
      'bg-red-50',
      'text-red-700',
      'border-red-200',
      'bg-emerald-50',
      'text-emerald-700',
      'border-emerald-200'
    );

    if (type === 'success') {
      feedbackEl.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    } else {
      feedbackEl.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
    }
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return '—';
    return dt.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  function formatPercent(val) {
    if (val === null || val === undefined || Number.isNaN(Number(val))) return '0%';
    const num = Number(val);
    return `${Number.isInteger(num) ? num : num.toFixed(1).replace('.', ',')}%`;
  }

  function updateCategoriaAviso() {
    if (!categoriaAvisoEl || !selectCategoria) return;

    const selectedId = selectCategoria.value;
    const cat = todasCategorias.find((c) => c.id === selectedId);

    if (!cat) {
      categoriaAvisoEl.classList.add('hidden');
      categoriaAvisoEl.replaceChildren();
      if (btnIniciar) btnIniciar.disabled = true;
      return;
    }

    const total = Number(cat.total_questoes_ativas || 0);
    categoriaAvisoEl.classList.remove(
      'hidden',
      'bg-red-50',
      'text-red-700',
      'border-red-200',
      'bg-amber-50',
      'text-amber-800',
      'border-amber-200',
      'bg-primary/10',
      'text-primary',
      'border-primary/20'
    );
    categoriaAvisoEl.replaceChildren();

    const icon = document.createElement('i');
    const text = document.createElement('span');

    if (total === 0) {
      categoriaAvisoEl.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
      icon.className = 'ph-fill ph-warning-circle text-lg shrink-0';
      text.textContent = 'Esta matéria ainda não possui questões ativas cadastradas.';
      if (btnIniciar) btnIniciar.disabled = true;
    } else if (total < 20) {
      categoriaAvisoEl.classList.add('bg-amber-50', 'text-amber-800', 'border-amber-200');
      icon.className = 'ph-fill ph-warning text-lg shrink-0';
      text.textContent = `Atenção: esta matéria possui ${total} ${
        total === 1 ? 'questão ativa disponível' : 'questões ativas disponíveis'
      } (padrão: 20). O simulado será gerado com ${total} ${total === 1 ? 'questão' : 'questões'} e 30 minutos.`;
      if (btnIniciar) btnIniciar.disabled = false;
    } else {
      categoriaAvisoEl.classList.add('bg-primary/10', 'text-primary', 'border-primary/20');
      icon.className = 'ph-fill ph-check-circle text-lg shrink-0';
      text.textContent = `${total} questões ativas no banco. O simulado sorteará 20 questões únicas aleatórias com cronômetro de 30 minutos.`;
      if (btnIniciar) btnIniciar.disabled = false;
    }

    categoriaAvisoEl.append(icon, text);
  }

  function populateMateriasByLicenca(licenca) {
    if (!selectCategoria) return;
    const filtradas = todasCategorias.filter((c) => c.licenca === licenca);
    selectCategoria.replaceChildren();

    if (!filtradas.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhuma matéria disponível';
      selectCategoria.appendChild(opt);
      updateCategoriaAviso();
      return;
    }

    filtradas.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      const qtd = Number(cat.total_questoes_ativas || 0);
      opt.textContent = `${cat.materia} (${qtd} ${qtd === 1 ? 'questão' : 'questões'})`;
      selectCategoria.appendChild(opt);
    });

    updateCategoriaAviso();
  }

  function renderCategorias(categorias) {
    todasCategorias = categorias;
    if (!selectLicenca || !selectCategoria) return;

    const licencas = [...new Set(categorias.map((c) => c.licenca))];
    selectLicenca.replaceChildren();

    if (!licencas.length) {
      const opt = document.createElement('option');
      opt.value = '';
      opt.textContent = 'Nenhuma categoria cadastrada';
      selectLicenca.appendChild(opt);
      populateMateriasByLicenca('');
      return;
    }

    licencas.forEach((lic) => {
      const opt = document.createElement('option');
      opt.value = lic;
      opt.textContent = lic;
      selectLicenca.appendChild(opt);
    });

    populateMateriasByLicenca(licencas[0]);
  }

  function renderResumoCategorias(resumoPorCategoria) {
    if (!secaoDesempenho || !resumoCategoriasGrid) return;
    resumoCategoriasGrid.replaceChildren();

    if (!resumoPorCategoria || !resumoPorCategoria.length) {
      secaoDesempenho.classList.add('hidden');
      return;
    }

    secaoDesempenho.classList.remove('hidden');

    resumoPorCategoria.forEach((item) => {
      const media = Number(item.media_percentual || 0);
      const atingiuMeta = media >= 70;

      const card = document.createElement('div');
      card.className = 'glass rounded-2xl p-5 shadow-sm space-y-3';

      const top = document.createElement('div');
      top.className = 'flex items-start justify-between gap-2';

      const info = document.createElement('div');
      const licBadge = document.createElement('span');
      licBadge.className = 'inline-block px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-poppins font-semibold mb-1';
      licBadge.textContent = item.licenca;

      const matTitle = document.createElement('h3');
      matTitle.className = 'font-poppins font-semibold text-sm text-carbon';
      matTitle.textContent = item.materia;

      info.append(licBadge, matTitle);

      const mediaEl = document.createElement('span');
      mediaEl.className = `font-poppins font-extrabold text-lg ${atingiuMeta ? 'text-emerald-600' : 'text-accent'}`;
      mediaEl.textContent = formatPercent(media);

      top.append(info, mediaEl);

      const barWrap = document.createElement('div');
      barWrap.className = 'h-2 w-full bg-carbon/10 rounded-full overflow-hidden';
      const barFill = document.createElement('div');
      barFill.className = `h-full rounded-full ${atingiuMeta ? 'bg-emerald-500' : 'bg-accent'}`;
      barFill.style.width = `${Math.min(100, Math.max(0, media))}%`;
      barWrap.appendChild(barFill);

      const metaText = document.createElement('p');
      metaText.className = 'text-xs text-carbon/65';
      metaText.textContent = `${item.total_simulados} ${
        item.total_simulados === 1 ? 'simulado' : 'simulados'
      } • ${item.aprovacoes} ${item.aprovacoes === 1 ? 'aprovação' : 'aprovações'}`;

      card.append(top, barWrap, metaText);
      resumoCategoriasGrid.appendChild(card);
    });
  }

  function renderHistorico(simulados) {
    if (historicoCountEl) {
      historicoCountEl.replaceChildren();
      const icon = document.createElement('i');
      icon.className = 'ph-fill ph-clock-counter-clockwise';
      const label = document.createTextNode(
        ` ${simulados.length} ${simulados.length === 1 ? 'registro' : 'registros'}`
      );
      historicoCountEl.append(icon, label);
    }

    if (!historicoContainer) return;
    historicoContainer.replaceChildren();

    if (!simulados.length) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'rounded-2xl bg-cloud border border-dashed border-primary/25 p-10 text-center';

      const icon = document.createElement('i');
      icon.className = 'ph-duotone ph-clipboard-text text-4xl text-primary/60 mb-3 block';

      const title = document.createElement('p');
      title.className = 'font-poppins font-semibold text-carbon';
      title.textContent = 'Nenhum simulado registrado ainda';

      const sub = document.createElement('p');
      sub.className = 'text-sm text-carbon/65 mt-1';
      sub.textContent = 'Selecione uma licença e matéria acima e clique em "Iniciar Simulado".';

      emptyBox.append(icon, title, sub);
      historicoContainer.appendChild(emptyBox);
      return;
    }

    simulados.forEach((sim) => {
      const isFinalizado = sim.status === 'FINALIZADO';
      const isAprovado = Boolean(sim.aprovado);

      const card = document.createElement('article');
      card.className = 'rounded-2xl bg-cloud border border-gray-200/80 hover:border-primary/40 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all';

      const left = document.createElement('div');
      left.className = 'space-y-2';

      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap items-center gap-2';

      const catBadge = document.createElement('span');
      catBadge.className = 'px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-poppins font-semibold';
      catBadge.textContent = `${sim.categoria_licenca} • ${sim.categoria_materia}`;

      const statusBadge = document.createElement('span');
      if (!isFinalizado) {
        statusBadge.className = 'px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-semibold';
        statusBadge.textContent = 'Em Andamento';
      } else if (isAprovado) {
        statusBadge.className = 'px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold';
        statusBadge.textContent = 'Aprovado';
      } else {
        statusBadge.className = 'px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold';
        statusBadge.textContent = 'Reprovado';
      }

      badges.append(catBadge, statusBadge);

      const meta = document.createElement('p');
      meta.className = 'text-xs sm:text-sm text-carbon/70';
      if (isFinalizado) {
        meta.textContent = `Finalizado em ${formatDateTime(sim.finalizado_em)} • ${sim.acertos ?? 0} de ${sim.total_questoes} acertos`;
      } else {
        meta.textContent = `Iniciado em ${formatDateTime(sim.iniciado_em)} • ${sim.total_questoes} questões • Limite ${sim.tempo_limite_minutos} min`;
      }

      left.append(badges, meta);

      const right = document.createElement('div');
      right.className = 'flex items-center justify-between md:justify-end gap-4';

      if (isFinalizado) {
        const notaEl = document.createElement('div');
        notaEl.className = `font-poppins font-extrabold text-2xl ${isAprovado ? 'text-emerald-600' : 'text-accent'}`;
        notaEl.textContent = formatPercent(sim.nota_percentual);
        right.appendChild(notaEl);
      }

      const actionLink = document.createElement('a');
      actionLink.href = `./simulado.html?id=${encodeURIComponent(sim.id)}`;
      if (isFinalizado) {
        actionLink.className = 'px-4 py-2.5 rounded-xl bg-white border border-gray-200 text-xs sm:text-sm font-poppins font-semibold text-carbon hover:border-primary hover:text-primary transition-all inline-flex items-center gap-1.5';
        const icon = document.createElement('i');
        icon.className = 'ph-bold ph-book-open-text text-base';
        actionLink.append(icon, document.createTextNode('Gabarito Comentado'));
      } else {
        actionLink.className = 'px-4 py-2.5 rounded-xl bg-accent text-white text-xs sm:text-sm font-poppins font-semibold shadow-sm hover:shadow-glow transition-all inline-flex items-center gap-1.5';
        const icon = document.createElement('i');
        icon.className = 'ph-bold ph-play text-base';
        actionLink.append(icon, document.createTextNode('Retomar Simulado'));
      }

      right.appendChild(actionLink);
      card.append(left, right);
      historicoContainer.appendChild(card);
    });
  }

  selectLicenca?.addEventListener('change', () => {
    populateMateriasByLicenca(selectLicenca.value);
  });

  selectCategoria?.addEventListener('change', () => {
    updateCategoriaAviso();
  });

  formNovoSimulado?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback('');

    const categoriaId = selectCategoria?.value || '';
    if (!categoriaId) {
      showFeedback('Selecione uma licença e uma matéria antes de iniciar.');
      return;
    }

    if (btnIniciar) btnIniciar.disabled = true;
    if (btnIniciarLabel) btnIniciarLabel.textContent = 'Gerando prova...';

    try {
      const data = await apiRequest('/simulados', {
        method: 'POST',
        body: JSON.stringify({ categoria_id: categoriaId }),
      });

      const simuladoId = data?.simulado?.id;
      if (!simuladoId) {
        throw new Error('Não foi possível identificar o simulado gerado.');
      }

      window.location.href = `./simulado.html?id=${encodeURIComponent(simuladoId)}`;
    } catch (err) {
      showFeedback(err.message || 'Erro ao iniciar simulado.');
      if (btnIniciar) btnIniciar.disabled = false;
      if (btnIniciarLabel) btnIniciarLabel.textContent = 'Iniciar Simulado';
    }
  });

  async function initDashboard() {
    if (!getToken()) {
      window.location.href = './login.html';
      return;
    }

    try {
      const me = await apiRequest('/auth/me', { method: 'GET' });
      const usuario = me?.usuario;
      if (!usuario) {
        window.location.href = './login.html';
        return;
      }

      const firstName = usuario.nome.split(' ')[0] || usuario.nome;
      if (welcomeNameEl) welcomeNameEl.textContent = firstName;

      const [catsRes, simsRes] = await Promise.all([
        apiRequest('/categorias', { method: 'GET' }),
        apiRequest('/simulados', { method: 'GET' }),
      ]);

      renderCategorias(catsRes?.categorias || []);

      const resumoGeral = simsRes?.resumo_geral || {};
      if (statSimuladosEl) statSimuladosEl.textContent = String(resumoGeral.total_simulados ?? 0);
      if (statMediaEl) statMediaEl.textContent = formatPercent(resumoGeral.media_geral ?? 0);
      if (statAprovacoesEl) statAprovacoesEl.textContent = String(resumoGeral.aprovacoes ?? 0);

      renderResumoCategorias(simsRes?.resumo_por_categoria || []);
      renderHistorico(simsRes?.simulados || []);

      loadingEl?.classList.add('hidden');
      contentEl?.classList.remove('hidden');
    } catch {
      window.location.href = './login.html';
    }
  }

  initDashboard();
});
