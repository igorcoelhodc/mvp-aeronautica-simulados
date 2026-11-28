// admin.js — Painel Administrativo por Cards Expansíveis (Categorias, Questões com Imagens e Gestão de Alunos)

import { apiRequest, apiUpload, getToken } from './api.js';
import { initNavbar } from './navbar.js';

const IMAGE_FIELD_KEYS = [
  'enunciado_imagem_url',
  'alternativa_a_imagem_url',
  'alternativa_b_imagem_url',
  'alternativa_c_imagem_url',
  'alternativa_d_imagem_url',
  'comentario_imagem_url',
];

const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024; // 5 MB

function isSafeUploadUrl(url) {
  return typeof url === 'string' && url.startsWith('/uploads/');
}

function generateStrongPassword(length = 14) {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%&*?';
  const all = upper + lower + digits + symbols;

  const pick = (charset) => {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    return charset[arr[0] % charset.length];
  };

  const chars = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (chars.length < length) {
    chars.push(pick(all));
  }

  // Embaralhamento Fisher-Yates com crypto.getRandomValues
  for (let i = chars.length - 1; i > 0; i -= 1) {
    const arr = new Uint32Array(1);
    window.crypto.getRandomValues(arr);
    const j = arr[0] % (i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }

  return chars.join('');
}

function bootstrapAdminPage() {
  const loadingEl = document.getElementById('admin-loading');
  const contentEl = document.getElementById('admin-content');
  const emptyHintEl = document.getElementById('admin-empty-hint');
  const desktopSlot = document.getElementById('admin-desktop-slot');
  const mobileMediaQuery = window.matchMedia('(max-width: 767px)');

  // Cards & Painéis expansíveis
  const cardButtons = document.querySelectorAll('[data-admin-card]');
  const panels = document.querySelectorAll('[data-admin-panel]');
  const cardCountCategorias = document.getElementById('card-count-categorias');
  const cardBadgeQuestao = document.getElementById('card-badge-questao');
  const cardCountQuestoes = document.getElementById('card-count-questoes');
  const cardCountAlunos = document.getElementById('card-count-alunos');
  const cardOnlineNum = document.getElementById('card-online-num');

  // Categorias
  const categoriaForm = document.getElementById('categoria-form');
  const catLicencaInput = document.getElementById('cat-licenca');
  const catMateriaInput = document.getElementById('cat-materia');
  const catSubmitBtn = document.getElementById('cat-submit-btn');
  const categoriaFeedback = document.getElementById('categoria-feedback');
  const categoriasChips = document.getElementById('categorias-chips');

  // Formulário de Questões
  const questaoForm = document.getElementById('questao-form');
  const questaoFormTitle = document.getElementById('questao-form-title');
  const questaoEditBadge = document.getElementById('questao-edit-badge');
  const questaoIdInput = document.getElementById('questao-id');
  const categoriaIdSelect = document.getElementById('categoria_id');
  const gabaritoSelect = document.getElementById('gabarito');
  const enunciadoInput = document.getElementById('enunciado');
  const altAInput = document.getElementById('alternativa_a');
  const altBInput = document.getElementById('alternativa_b');
  const altCInput = document.getElementById('alternativa_c');
  const altDInput = document.getElementById('alternativa_d');
  const comentarioInput = document.getElementById('comentario');
  const questaoCancelBtn = document.getElementById('questao-cancel-btn');
  const questaoResetBtn = document.getElementById('questao-reset-btn');
  const questaoSubmitBtn = document.getElementById('questao-submit-btn');
  const questaoSubmitLabel = document.getElementById('questao-submit-label');
  const questaoFeedback = document.getElementById('questao-feedback');

  // Filtros e Listagem de Questões
  const filtroForm = document.getElementById('filtro-form');
  const filtroCategoria = document.getElementById('filtro-categoria');
  const filtroAtiva = document.getElementById('filtro-ativa');
  const filtroBusca = document.getElementById('filtro-busca');
  const filtroLimparBtn = document.getElementById('filtro-limpar-btn');
  const questoesCountBadge = document.getElementById('questoes-count-badge');
  const bancoFeedback = document.getElementById('banco-feedback');
  const listaQuestoesEl = document.getElementById('lista-questoes');

  // Gestão de Alunos
  const alunosFiltroForm = document.getElementById('alunos-filtro-form');
  const alunosBuscaInput = document.getElementById('alunos-busca');
  const alunosFiltroAtivo = document.getElementById('alunos-filtro-ativo');
  const alunosLimparBtn = document.getElementById('alunos-limpar-btn');
  const alunosCountBadge = document.getElementById('alunos-count-badge');
  const alunosFeedback = document.getElementById('alunos-feedback');
  const listaAlunosEl = document.getElementById('lista-alunos');

  // Métricas (Chart.js + Polling 10s)
  const metricasDiasSelect = document.getElementById('metricas-dias');
  const btnAtualizarMetricas = document.getElementById('btn-atualizar-metricas');
  const metricasUltimaAtualizacao = document.getElementById('metricas-ultima-atualizacao');
  const metricasFeedback = document.getElementById('metricas-feedback');
  const kpiOnlineAgora = document.getElementById('kpi-online-agora');
  const kpiSessoesHoje = document.getElementById('kpi-sessoes-hoje');
  const kpiAutenticadosHoje = document.getElementById('kpi-autenticados-hoje');
  const kpiDuracaoMedia = document.getElementById('kpi-duracao-media');
  const kpiPaginasSessao = document.getElementById('kpi-paginas-sessao');
  const canvasSerieDiaria = document.getElementById('chart-serie-diaria');
  const emptySerieDiaria = document.getElementById('empty-serie-diaria');
  const canvasDispositivos = document.getElementById('chart-dispositivos');
  const emptyDispositivos = document.getElementById('empty-dispositivos');
  const canvasLocalidades = document.getElementById('chart-localidades');
  const emptyLocalidades = document.getElementById('empty-localidades');
  const canvasPaginas = document.getElementById('chart-paginas');
  const emptyPaginas = document.getElementById('empty-paginas');

  // Modal Reset de Senha
  const resetModal = document.getElementById('reset-senha-modal');
  const resetModalClose = document.getElementById('reset-modal-close');
  const resetModalCancel = document.getElementById('reset-modal-cancel');
  const resetAlunoIdInput = document.getElementById('reset-aluno-id');
  const resetAlunoNomeEl = document.getElementById('reset-aluno-nome');
  const resetAlunoEmailEl = document.getElementById('reset-aluno-email');
  const resetSenhaForm = document.getElementById('reset-senha-form');
  const resetNovaSenhaInput = document.getElementById('reset-nova-senha');
  const btnGerarSenha = document.getElementById('btn-gerar-senha');
  const btnCopiarSenha = document.getElementById('btn-copiar-senha');
  const btnCopiarLabel = document.getElementById('btn-copiar-label');
  const resetModalFeedback = document.getElementById('reset-modal-feedback');
  const resetSubmitBtn = document.getElementById('reset-submit-btn');
  const resetSubmitLabel = document.getElementById('reset-submit-label');

  const imageWidgets = new Map();
  let activeUploadsCount = 0;
  let activePanelKey = null;

  let metricasPollTimer = null;
  let chartSerieDiaria = null;
  let chartDispositivos = null;
  let chartLocalidades = null;
  let chartPaginas = null;

  function showFeedback(el, message, type = 'error') {
    if (!el) return;
    if (!message) {
      el.classList.add('hidden');
      el.textContent = '';
      return;
    }
    el.textContent = message;
    el.classList.remove(
      'hidden',
      'bg-red-50',
      'text-red-700',
      'border-red-200',
      'bg-emerald-50',
      'text-emerald-700',
      'border-emerald-200'
    );
    if (type === 'success') {
      el.classList.add('bg-emerald-50', 'text-emerald-700', 'border-emerald-200');
    } else {
      el.classList.add('bg-red-50', 'text-red-700', 'border-red-200');
    }
  }

  function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Controle dos Cards Expansíveis (Acordeão no Mobile < 768px / Painel abaixo da grade no Desktop >= 768px)
  function mountPanelForViewport(panelKey) {
    const panelEl = document.querySelector(`[data-admin-panel="${panelKey}"]`);
    if (!panelEl) return null;

    if (mobileMediaQuery.matches) {
      const mobileSlot = document.querySelector(`[data-mobile-slot="${panelKey}"]`);
      if (mobileSlot && panelEl.parentElement !== mobileSlot) {
        mobileSlot.appendChild(panelEl);
      }
      panelEl.classList.add('mt-4');
    } else {
      if (desktopSlot && panelEl.parentElement !== desktopSlot) {
        desktopSlot.appendChild(panelEl);
      }
      panelEl.classList.remove('mt-4');
    }

    return panelEl;
  }

  function setActivePanel(panelKey, { allowToggleClose = false, scrollToPanel = false } = {}) {
    if (allowToggleClose && activePanelKey === panelKey) {
      activePanelKey = null;
    } else {
      activePanelKey = panelKey;
    }

    cardButtons.forEach((btn) => {
      const isSelected = btn.dataset.adminCard === activePanelKey;
      btn.classList.toggle('admin-card-active', isSelected);
      btn.setAttribute('aria-expanded', String(isSelected));
    });

    let targetPanelEl = null;
    if (activePanelKey) {
      targetPanelEl = mountPanelForViewport(activePanelKey);
    }

    panels.forEach((panel) => {
      const isSelected = panel.dataset.adminPanel === activePanelKey;
      panel.classList.toggle('hidden', !isSelected);
    });

    emptyHintEl?.classList.toggle('hidden', Boolean(activePanelKey));

    if (activePanelKey === 'metricas') {
      loadMetricas({ silent: false });
      startMetricasPolling();
      requestAnimationFrame(resizeMetricasCharts);
    } else {
      stopMetricasPolling();
    }

    if (scrollToPanel && targetPanelEl) {
      requestAnimationFrame(() => {
        targetPanelEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }

  mobileMediaQuery.addEventListener('change', () => {
    if (activePanelKey) {
      mountPanelForViewport(activePanelKey);
      if (activePanelKey === 'metricas') {
        requestAnimationFrame(resizeMetricasCharts);
      }
    }
  });

  cardButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.adminCard;
      const willOpen = !(activePanelKey === target);
      setActivePanel(target, {
        allowToggleClose: true,
        scrollToPanel: mobileMediaQuery.matches && willOpen,
      });
      if (activePanelKey === 'alunos') {
        loadAlunos().catch((err) => showFeedback(alunosFeedback, err.message || 'Erro ao carregar alunos.'));
      }
    });
  });

  // Uploaders de Imagem
  function setWidgetStatus(widget, message, isError = false) {
    if (!widget?.statusEl) return;
    widget.statusEl.textContent = message || '';
    widget.statusEl.classList.toggle('text-red-600', isError);
    widget.statusEl.classList.toggle('text-carbon/65', !isError);
  }

  function setImageFieldValue(fieldKey, url) {
    const widget = imageWidgets.get(fieldKey);
    if (!widget) return;

    const validUrl = isSafeUploadUrl(url) ? url : '';
    widget.urlInput.value = validUrl;

    if (validUrl) {
      widget.previewImg.src = validUrl;
      widget.previewWrap.classList.remove('hidden');
      widget.previewWrap.classList.add('inline-flex');
      widget.btnLabel.textContent = 'Trocar imagem';
    } else {
      widget.previewImg.removeAttribute('src');
      widget.previewWrap.classList.add('hidden');
      widget.previewWrap.classList.remove('inline-flex');
      widget.btnLabel.textContent = 'Anexar imagem';
    }
    setWidgetStatus(widget, '');
  }

  function getImageFieldValue(fieldKey) {
    const widget = imageWidgets.get(fieldKey);
    if (!widget) return null;
    const val = widget.urlInput.value.trim();
    return val ? val : null;
  }

  function resetAllImageFields() {
    IMAGE_FIELD_KEYS.forEach((key) => {
      const widget = imageWidgets.get(key);
      if (widget?.fileInput) widget.fileInput.value = '';
      setImageFieldValue(key, null);
    });
  }

  function initImageWidgets() {
    document.querySelectorAll('[data-image-field]').forEach((container) => {
      const fieldKey = container.dataset.imageField;
      const urlInput = container.querySelector('[data-image-url]');
      const fileInput = container.querySelector('[data-image-file]');
      const triggerBtn = container.querySelector('[data-image-trigger]');
      const btnLabel = container.querySelector('[data-image-btn-label]');
      const statusEl = container.querySelector('[data-image-status]');
      const previewWrap = container.querySelector('[data-image-preview-wrap]');
      const previewImg = container.querySelector('[data-image-preview]');
      const removeBtn = container.querySelector('[data-image-remove]');

      if (!fieldKey || !urlInput || !fileInput || !triggerBtn || !previewWrap || !previewImg) {
        return;
      }

      const widget = {
        fieldKey,
        urlInput,
        fileInput,
        triggerBtn,
        btnLabel,
        statusEl,
        previewWrap,
        previewImg,
        removeBtn,
      };
      imageWidgets.set(fieldKey, widget);

      triggerBtn.addEventListener('click', () => fileInput.click());

      removeBtn?.addEventListener('click', () => {
        fileInput.value = '';
        setImageFieldValue(fieldKey, null);
      });

      fileInput.addEventListener('change', async () => {
        const file = fileInput.files?.[0];
        if (!file) return;

        if (file.size > MAX_UPLOAD_BYTES) {
          setWidgetStatus(widget, 'Arquivo maior que 5 MB.', true);
          fileInput.value = '';
          return;
        }
        if (file.type && !ALLOWED_IMAGE_TYPES.has(file.type)) {
          setWidgetStatus(widget, 'Use apenas JPEG, PNG ou WebP.', true);
          fileInput.value = '';
          return;
        }

        const formData = new FormData();
        formData.append('file', file);

        activeUploadsCount += 1;
        triggerBtn.disabled = true;
        setWidgetStatus(widget, 'Enviando imagem...');

        try {
          const data = await apiUpload('/admin/uploads', formData);
          if (!isSafeUploadUrl(data?.url)) {
            throw new Error('URL de imagem retornada pelo servidor é inválida.');
          }
          setImageFieldValue(fieldKey, data.url);
          setWidgetStatus(widget, 'Imagem anexada.');
        } catch (err) {
          setWidgetStatus(widget, err.message || 'Erro ao enviar imagem.', true);
        } finally {
          activeUploadsCount = Math.max(0, activeUploadsCount - 1);
          triggerBtn.disabled = false;
          fileInput.value = '';
        }
      });
    });
  }

  function resetQuestaoFormMode() {
    questaoForm?.reset();
    resetAllImageFields();
    if (questaoIdInput) questaoIdInput.value = '';
    if (questaoFormTitle) questaoFormTitle.textContent = 'Cadastrar Questão Comentada';
    if (questaoSubmitLabel) questaoSubmitLabel.textContent = 'Salvar Questão';
    if (cardBadgeQuestao) cardBadgeQuestao.textContent = 'Cadastrar';
    questaoEditBadge?.classList.add('hidden');
    questaoEditBadge?.classList.remove('inline-flex');
    questaoCancelBtn?.classList.add('hidden');
  }

  function enterEditMode(questao) {
    if (!questao) return;
    if (questaoIdInput) questaoIdInput.value = questao.id;
    if (categoriaIdSelect) categoriaIdSelect.value = questao.categoria_id;
    if (gabaritoSelect) gabaritoSelect.value = questao.gabarito;
    if (enunciadoInput) enunciadoInput.value = questao.enunciado;
    if (altAInput) altAInput.value = questao.alternativa_a;
    if (altBInput) altBInput.value = questao.alternativa_b;
    if (altCInput) altCInput.value = questao.alternativa_c;
    if (altDInput) altDInput.value = questao.alternativa_d;
    if (comentarioInput) comentarioInput.value = questao.comentario;

    IMAGE_FIELD_KEYS.forEach((key) => {
      setImageFieldValue(key, questao[key] || null);
    });

    if (questaoFormTitle) questaoFormTitle.textContent = 'Editar Questão Comentada';
    if (questaoSubmitLabel) questaoSubmitLabel.textContent = 'Atualizar Questão';
    if (cardBadgeQuestao) cardBadgeQuestao.textContent = 'Editando';
    questaoEditBadge?.classList.remove('hidden');
    questaoEditBadge?.classList.add('inline-flex');
    questaoCancelBtn?.classList.remove('hidden');
    showFeedback(questaoFeedback, '');

    // Expande automaticamente o painel "Nova Questão" e rola suavemente até o formulário
    setActivePanel('nova-questao', { allowToggleClose: false, scrollToPanel: true });
  }

  questaoCancelBtn?.addEventListener('click', () => {
    resetQuestaoFormMode();
    showFeedback(questaoFeedback, '');
  });

  questaoResetBtn?.addEventListener('click', () => {
    resetQuestaoFormMode();
    showFeedback(questaoFeedback, '');
  });

  function createAdminThumb(url, altText, sizeClass = 'max-h-36') {
    if (!isSafeUploadUrl(url)) return null;
    const img = document.createElement('img');
    img.src = url;
    img.alt = altText;
    img.loading = 'lazy';
    img.className = `${sizeClass} w-auto max-w-full rounded-xl border border-gray-200/80 bg-white mt-2 object-contain`;
    return img;
  }

  // Renderização de Categorias
  function renderCategorias(categorias) {
    if (cardCountCategorias) cardCountCategorias.textContent = String(categorias.length);

    const selectedFormVal = categoriaIdSelect?.value || '';
    const selectedFilterVal = filtroCategoria?.value || '';

    if (categoriaIdSelect) {
      categoriaIdSelect.replaceChildren();
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Selecione a categoria';
      categoriaIdSelect.appendChild(placeholder);

      categorias.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.licenca} — ${cat.materia}`;
        categoriaIdSelect.appendChild(opt);
      });
      categoriaIdSelect.value = selectedFormVal;
    }

    if (filtroCategoria) {
      filtroCategoria.replaceChildren();
      const allOpt = document.createElement('option');
      allOpt.value = '';
      allOpt.textContent = 'Todas as categorias';
      filtroCategoria.appendChild(allOpt);

      categorias.forEach((cat) => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.textContent = `${cat.licenca} — ${cat.materia}`;
        filtroCategoria.appendChild(opt);
      });
      filtroCategoria.value = selectedFilterVal;
    }

    if (categoriasChips) {
      categoriasChips.replaceChildren();
      if (!categorias.length) {
        const empty = document.createElement('span');
        empty.className = 'text-carbon/60';
        empty.textContent = 'Nenhuma categoria cadastrada ainda.';
        categoriasChips.appendChild(empty);
        return;
      }

      categorias.forEach((cat) => {
        const chip = document.createElement('span');
        chip.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/80 border border-primary/20 text-carbon font-medium';

        const lic = document.createElement('strong');
        lic.className = 'text-primary font-poppins';
        lic.textContent = cat.licenca;

        const qtd = Number(cat.total_questoes_ativas ?? 0);
        const sep = document.createTextNode(` • ${cat.materia} (${qtd})`);
        chip.append(lic, sep);
        categoriasChips.appendChild(chip);
      });
    }
  }

  // Renderização de Questões
  function renderQuestoes(questoes) {
    if (cardCountQuestoes) cardCountQuestoes.textContent = String(questoes.length);
    if (questoesCountBadge) {
      questoesCountBadge.textContent = `${questoes.length} ${questoes.length === 1 ? 'questão' : 'questões'}`;
    }

    if (!listaQuestoesEl) return;
    listaQuestoesEl.replaceChildren();

    if (!questoes.length) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'rounded-2xl bg-cloud border border-dashed border-primary/25 p-10 text-center';

      const icon = document.createElement('i');
      icon.className = 'ph-duotone ph-list-magnifying-glass text-4xl text-primary/60 mb-3 block';

      const title = document.createElement('p');
      title.className = 'font-poppins font-semibold text-carbon';
      title.textContent = 'Nenhuma questão encontrada';

      const sub = document.createElement('p');
      sub.className = 'text-sm text-carbon/65 mt-1';
      sub.textContent = 'Ajuste os filtros ou cadastre uma nova questão.';

      emptyBox.append(icon, title, sub);
      listaQuestoesEl.appendChild(emptyBox);
      return;
    }

    questoes.forEach((q) => {
      const card = document.createElement('article');
      card.className = `rounded-2xl p-6 border transition-all ${
        q.ativa
          ? 'bg-cloud border-gray-200/80 hover:border-primary/40'
          : 'bg-gray-50/80 border-gray-200 opacity-75'
      }`;

      const header = document.createElement('div');
      header.className = 'flex flex-wrap items-center justify-between gap-3 mb-4';

      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap items-center gap-2';

      const catBadge = document.createElement('span');
      catBadge.className = 'px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-poppins font-semibold';
      catBadge.textContent = `${q.categoria_licenca} • ${q.categoria_materia}`;

      const statusBadge = document.createElement('span');
      statusBadge.className = q.ativa
        ? 'px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold'
        : 'px-3 py-1 rounded-full bg-gray-200 text-gray-600 text-xs font-semibold';
      statusBadge.textContent = q.ativa ? 'Ativa' : 'Inativa';

      const gabBadge = document.createElement('span');
      gabBadge.className = 'px-3 py-1 rounded-full bg-accent/15 text-accent text-xs font-poppins font-bold';
      gabBadge.textContent = `Gabarito: ${q.gabarito}`;

      badges.append(catBadge, statusBadge, gabBadge);

      const hasImages = IMAGE_FIELD_KEYS.some((key) => isSafeUploadUrl(q[key]));
      if (hasImages) {
        const imgBadge = document.createElement('span');
        imgBadge.className = 'px-2.5 py-1 rounded-full bg-secondary/15 text-primary text-xs font-semibold inline-flex items-center gap-1';
        const imgIcon = document.createElement('i');
        imgIcon.className = 'ph-fill ph-image';
        imgBadge.append(imgIcon, document.createTextNode('Com imagem'));
        badges.appendChild(imgBadge);
      }

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-poppins font-semibold text-carbon hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5';
      const editIcon = document.createElement('i');
      editIcon.className = 'ph-bold ph-pencil-simple';
      editBtn.append(editIcon, document.createTextNode('Editar'));
      editBtn.addEventListener('click', () => enterEditMode(q));
      actions.appendChild(editBtn);

      if (q.ativa) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'px-3.5 py-1.5 rounded-xl bg-white border border-red-200 text-xs font-poppins font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5';
        const delIcon = document.createElement('i');
        delIcon.className = 'ph-bold ph-eye-slash';
        delBtn.append(delIcon, document.createTextNode('Desativar'));
        delBtn.addEventListener('click', () => handleDesativarQuestao(q.id));
        actions.appendChild(delBtn);
      } else {
        const reactivateBtn = document.createElement('button');
        reactivateBtn.type = 'button';
        reactivateBtn.className = 'px-3.5 py-1.5 rounded-xl bg-white border border-emerald-200 text-xs font-poppins font-semibold text-emerald-700 hover:bg-emerald-50 transition-colors flex items-center gap-1.5';
        const actIcon = document.createElement('i');
        actIcon.className = 'ph-bold ph-eye';
        reactivateBtn.append(actIcon, document.createTextNode('Ativar'));
        reactivateBtn.addEventListener('click', () => handleReativarQuestao(q));
        actions.appendChild(reactivateBtn);
      }

      header.append(badges, actions);

      const enunciadoWrap = document.createElement('div');
      enunciadoWrap.className = 'mb-4';

      const enunciadoEl = document.createElement('h3');
      enunciadoEl.className = 'font-poppins font-semibold text-base text-carbon leading-relaxed';
      enunciadoEl.textContent = q.enunciado;
      enunciadoWrap.appendChild(enunciadoEl);

      const enunThumb = createAdminThumb(q.enunciado_imagem_url, 'Imagem do enunciado', 'max-h-40');
      if (enunThumb) enunciadoWrap.appendChild(enunThumb);

      const altsGrid = document.createElement('div');
      altsGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4 text-sm';

      const alts = [
        ['A', q.alternativa_a, q.alternativa_a_imagem_url],
        ['B', q.alternativa_b, q.alternativa_b_imagem_url],
        ['C', q.alternativa_c, q.alternativa_c_imagem_url],
        ['D', q.alternativa_d, q.alternativa_d_imagem_url],
      ];

      alts.forEach(([letra, texto, imgUrl]) => {
        const isCorrect = q.gabarito === letra;
        const altItem = document.createElement('div');
        altItem.className = isCorrect
          ? 'p-3 rounded-xl border border-primary/50 bg-primary/10 text-carbon font-medium'
          : 'p-3 rounded-xl border border-gray-200/80 bg-white text-carbon/85';

        const textLine = document.createElement('div');
        const strong = document.createElement('strong');
        strong.className = isCorrect ? 'text-primary font-poppins mr-1.5' : 'text-carbon/70 font-poppins mr-1.5';
        strong.textContent = `${letra})`;
        textLine.append(strong, document.createTextNode(texto));
        altItem.appendChild(textLine);

        const altThumb = createAdminThumb(imgUrl, `Imagem da alternativa ${letra}`, 'max-h-24');
        if (altThumb) altItem.appendChild(altThumb);

        altsGrid.appendChild(altItem);
      });

      const comentarioBox = document.createElement('div');
      comentarioBox.className = 'p-3.5 rounded-xl glass-dark text-xs sm:text-sm text-carbon/85 leading-relaxed';

      const comText = document.createElement('div');
      const comLabel = document.createElement('strong');
      comLabel.className = 'text-primary font-poppins mr-1.5';
      comLabel.textContent = 'Comentário:';
      comText.append(comLabel, document.createTextNode(q.comentario));
      comentarioBox.appendChild(comText);

      const comThumb = createAdminThumb(q.comentario_imagem_url, 'Imagem do comentário', 'max-h-36');
      if (comThumb) comentarioBox.appendChild(comThumb);

      card.append(header, enunciadoWrap, altsGrid, comentarioBox);
      listaQuestoesEl.appendChild(card);
    });
  }

  // Renderização de Alunos (100% DOM seguro contra XSS)
  function renderAlunos(alunos) {
    if (cardCountAlunos) cardCountAlunos.textContent = String(alunos.length);
    if (alunosCountBadge) {
      alunosCountBadge.textContent = `${alunos.length} ${alunos.length === 1 ? 'aluno' : 'alunos'}`;
    }

    if (!listaAlunosEl) return;
    listaAlunosEl.replaceChildren();

    if (!alunos.length) {
      const emptyBox = document.createElement('div');
      emptyBox.className = 'rounded-2xl bg-cloud border border-dashed border-primary/25 p-10 text-center';

      const icon = document.createElement('i');
      icon.className = 'ph-duotone ph-users-three text-4xl text-primary/60 mb-3 block';

      const title = document.createElement('p');
      title.className = 'font-poppins font-semibold text-carbon';
      title.textContent = 'Nenhum aluno encontrado';

      const sub = document.createElement('p');
      sub.className = 'text-sm text-carbon/65 mt-1';
      sub.textContent = 'Tente outro termo de busca ou aguarde novos cadastros.';

      emptyBox.append(icon, title, sub);
      listaAlunosEl.appendChild(emptyBox);
      return;
    }

    alunos.forEach((aluno) => {
      const row = document.createElement('article');
      row.className =
        'rounded-2xl bg-cloud border border-gray-200/80 hover:border-primary/40 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all';

      const left = document.createElement('div');
      left.className = 'space-y-1 min-w-0';

      const nameLine = document.createElement('div');
      nameLine.className = 'flex flex-wrap items-center gap-2';

      const nameEl = document.createElement('h3');
      nameEl.className = 'font-poppins font-semibold text-base text-carbon truncate';
      nameEl.textContent = aluno.nome;

      const statusBadge = document.createElement('span');
      statusBadge.className = aluno.ativo
        ? 'px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold'
        : 'px-2.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold';
      statusBadge.textContent = aluno.ativo ? 'Habilitado' : 'Desabilitado';

      const simsBadge = document.createElement('span');
      simsBadge.className = 'px-2.5 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-poppins font-semibold';
      const totalSims = Number(aluno.total_simulados ?? 0);
      simsBadge.textContent = `${totalSims} ${totalSims === 1 ? 'simulado' : 'simulados'}`;

      nameLine.append(nameEl, statusBadge, simsBadge);

      const emailEl = document.createElement('p');
      emailEl.className = 'text-sm text-carbon/75 break-all';
      emailEl.textContent = aluno.email;

      const metaEl = document.createElement('p');
      metaEl.className = 'text-xs text-carbon/60';
      const finalizados = Number(aluno.simulados_finalizados ?? 0);
      metaEl.textContent = `Cadastro em ${formatDate(aluno.criado_em)} • ${finalizados} ${
        finalizados === 1 ? 'finalizado' : 'finalizados'
      }`;

      left.append(nameLine, emailEl, metaEl);

      const actions = document.createElement('div');
      actions.className = 'flex flex-wrap items-center gap-2 shrink-0';

      const toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      if (aluno.ativo) {
        toggleBtn.className =
          'px-3.5 py-2.5 rounded-xl bg-white border border-red-200 text-xs sm:text-sm font-poppins font-semibold text-red-600 hover:bg-red-50 transition-all inline-flex items-center justify-center gap-1.5';
        const blockIcon = document.createElement('i');
        blockIcon.className = 'ph-bold ph-prohibit text-base';
        toggleBtn.append(blockIcon, document.createTextNode('Desabilitar'));
      } else {
        toggleBtn.className =
          'px-3.5 py-2.5 rounded-xl bg-emerald-600 text-white text-xs sm:text-sm font-poppins font-semibold hover:bg-emerald-700 transition-all inline-flex items-center justify-center gap-1.5';
        const checkIcon = document.createElement('i');
        checkIcon.className = 'ph-bold ph-check-circle text-base';
        toggleBtn.append(checkIcon, document.createTextNode('Habilitar'));
      }
      toggleBtn.addEventListener('click', () => handleToggleStatusAluno(aluno, toggleBtn));

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className =
        'px-4 py-2.5 rounded-xl bg-white border border-accent/40 text-xs sm:text-sm font-poppins font-semibold text-accent hover:bg-accent hover:text-white transition-all inline-flex items-center justify-center gap-1.5';
      const keyIcon = document.createElement('i');
      keyIcon.className = 'ph-bold ph-key text-base';
      resetBtn.append(keyIcon, document.createTextNode('Resetar Senha'));
      resetBtn.addEventListener('click', () => openResetSenhaModal(aluno));

      actions.append(toggleBtn, resetBtn);
      row.append(left, actions);
      listaAlunosEl.appendChild(row);
    });
  }

  // Modal de Reset de Senha
  function openResetSenhaModal(aluno) {
    if (!resetModal || !aluno) return;
    if (resetAlunoIdInput) resetAlunoIdInput.value = aluno.id;
    if (resetAlunoNomeEl) resetAlunoNomeEl.textContent = aluno.nome;
    if (resetAlunoEmailEl) resetAlunoEmailEl.textContent = aluno.email;
    if (resetNovaSenhaInput) resetNovaSenhaInput.value = '';
    if (btnCopiarLabel) btnCopiarLabel.textContent = 'Copiar senha';
    showFeedback(resetModalFeedback, '');

    resetModal.classList.remove('hidden');
    resetModal.classList.add('flex');
    document.body.style.overflow = 'hidden';
    resetNovaSenhaInput?.focus();
  }

  function closeResetSenhaModal() {
    if (!resetModal) return;
    resetModal.classList.add('hidden');
    resetModal.classList.remove('flex');
    document.body.style.overflow = '';
  }

  resetModalClose?.addEventListener('click', closeResetSenhaModal);
  resetModalCancel?.addEventListener('click', closeResetSenhaModal);
  resetModal?.addEventListener('click', (event) => {
    if (event.target === resetModal) closeResetSenhaModal();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && resetModal && !resetModal.classList.contains('hidden')) {
      closeResetSenhaModal();
    }
  });

  btnGerarSenha?.addEventListener('click', () => {
    if (!resetNovaSenhaInput) return;
    resetNovaSenhaInput.value = generateStrongPassword(14);
    if (btnCopiarLabel) btnCopiarLabel.textContent = 'Copiar senha';
    showFeedback(resetModalFeedback, '');
  });

  btnCopiarSenha?.addEventListener('click', async () => {
    const senha = resetNovaSenhaInput?.value || '';
    if (!senha) {
      showFeedback(resetModalFeedback, 'Gere ou digite uma senha antes de copiar.');
      return;
    }

    try {
      await navigator.clipboard.writeText(senha);
      if (btnCopiarLabel) btnCopiarLabel.textContent = 'Copiada!';
      setTimeout(() => {
        if (btnCopiarLabel) btnCopiarLabel.textContent = 'Copiar senha';
      }, 2500);
    } catch {
      resetNovaSenhaInput?.select();
      showFeedback(resetModalFeedback, 'Selecione e copie a senha manualmente (Ctrl+C).');
    }
  });

  resetSenhaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(resetModalFeedback, '');

    const alunoId = resetAlunoIdInput?.value.trim() || '';
    const novaSenha = resetNovaSenhaInput?.value || '';

    if (novaSenha.length < 8) {
      showFeedback(resetModalFeedback, 'A nova senha deve ter pelo menos 8 caracteres.');
      resetNovaSenhaInput?.focus();
      return;
    }

    if (resetSubmitBtn) resetSubmitBtn.disabled = true;
    if (resetSubmitLabel) resetSubmitLabel.textContent = 'Atualizando...';

    try {
      const data = await apiRequest(`/admin/alunos/${encodeURIComponent(alunoId)}/reset-senha`, {
        method: 'POST',
        body: JSON.stringify({ nova_senha: novaSenha }),
      });
      showFeedback(
        resetModalFeedback,
        data?.message || 'Senha atualizada com sucesso! Copie a senha acima para enviar ao aluno.',
        'success'
      );
    } catch (err) {
      showFeedback(resetModalFeedback, err.message || 'Erro ao redefinir senha do aluno.');
    } finally {
      if (resetSubmitBtn) resetSubmitBtn.disabled = false;
      if (resetSubmitLabel) resetSubmitLabel.textContent = 'Confirmar Nova Senha';
    }
  });

  // Chamadas de API
  async function loadCategorias() {
    const data = await apiRequest('/categorias', { method: 'GET' });
    renderCategorias(data?.categorias || []);
  }

  async function loadQuestoes() {
    const params = new URLSearchParams();
    if (filtroCategoria?.value) params.set('categoria_id', filtroCategoria.value);
    if (filtroAtiva?.value) params.set('ativa', filtroAtiva.value);
    if (filtroBusca?.value.trim()) params.set('busca', filtroBusca.value.trim());

    const qs = params.toString();
    const data = await apiRequest(`/admin/questoes${qs ? `?${qs}` : ''}`, { method: 'GET' });
    renderQuestoes(data?.questoes || []);
  }

  async function loadAlunos() {
    const params = new URLSearchParams();
    const busca = alunosBuscaInput?.value.trim() || '';
    const ativoFilter = alunosFiltroAtivo?.value || '';
    if (busca) params.set('q', busca);
    if (ativoFilter) params.set('ativo', ativoFilter);

    const qs = params.toString();
    const data = await apiRequest(`/admin/alunos${qs ? `?${qs}` : ''}`, { method: 'GET' });
    renderAlunos(data?.alunos || []);
  }

  async function handleToggleStatusAluno(aluno, buttonEl) {
    const novoStatus = !aluno.ativo;
    const acao = novoStatus ? 'habilitar' : 'desabilitar';
    if (
      !novoStatus &&
      !window.confirm(`Deseja desabilitar o acesso de ${aluno.nome}? O aluno será desconectado imediatamente.`)
    ) {
      return;
    }

    showFeedback(alunosFeedback, '');
    if (buttonEl) buttonEl.disabled = true;

    try {
      await apiRequest(`/admin/alunos/${encodeURIComponent(aluno.id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ ativo: novoStatus }),
      });
      showFeedback(
        alunosFeedback,
        novoStatus
          ? `Acesso de ${aluno.nome} habilitado com sucesso.`
          : `Acesso de ${aluno.nome} desabilitado imediatamente.`,
        'success'
      );
      await loadAlunos();
    } catch (err) {
      showFeedback(alunosFeedback, err.message || `Erro ao ${acao} aluno.`);
      if (buttonEl) buttonEl.disabled = false;
    }
  }

  // Métricas em Tempo Real (Chart.js + Polling inteligente de 10s)
  function formatDuracao(segundos) {
    const total = Math.max(0, Math.round(Number(segundos || 0)));
    if (total < 60) return `${total}s`;
    const mins = Math.floor(total / 60);
    const secs = total % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  }

  function formatDiaCurto(isoDate) {
    if (!isoDate || typeof isoDate !== 'string') return '';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return `${parts[2]}/${parts[1]}`;
  }

  function formatDispositivoLabel(tipo) {
    switch (tipo) {
      case 'mobile':
        return 'Mobile';
      case 'desktop':
        return 'Desktop';
      case 'tablet':
        return 'Tablet';
      default:
        return 'Desconhecido';
    }
  }

  function formatLocalidadeLabel(loc) {
    const parts = [loc.cidade, loc.regiao, loc.pais].filter(
      (p) => p && p !== 'Desconhecido' && p !== 'Desconhecida'
    );
    return parts.length ? parts.join(' - ') : 'Localidade desconhecida';
  }

  function resizeMetricasCharts() {
    [chartSerieDiaria, chartDispositivos, chartLocalidades, chartPaginas].forEach((chart) => {
      if (chart && typeof chart.resize === 'function') {
        chart.resize();
      }
    });
  }

  function renderMetricasCharts(data) {
    if (typeof window.Chart === 'undefined') {
      showFeedback(metricasFeedback, 'Chart.js não pôde ser carregado. Verifique a conexão com o CDN.');
      return;
    }

    const serie = data?.serie_diaria || [];
    const dispositivos = data?.dispositivos || [];
    const localidades = data?.localidades || [];
    const paginas = data?.paginas_top || [];

    // 1. Gráfico Linha/Área — Série Diária
    if (canvasSerieDiaria) {
      emptySerieDiaria?.classList.toggle('hidden', serie.length > 0);
      const labels = serie.map((item) => formatDiaCurto(item.dia));
      const sessoesData = serie.map((item) => item.total_sessoes);
      const unicosData = serie.map((item) => item.visitantes_unicos_ip);

      if (!chartSerieDiaria) {
        chartSerieDiaria = new window.Chart(canvasSerieDiaria, {
          type: 'line',
          data: {
            labels,
            datasets: [
              {
                label: 'Sessões',
                data: sessoesData,
                borderColor: '#1E88E5',
                backgroundColor: 'rgba(30, 136, 229, 0.14)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
              },
              {
                label: 'Visitantes únicos',
                data: unicosData,
                borderColor: '#FF6D00',
                backgroundColor: 'rgba(255, 109, 0, 0.08)',
                fill: true,
                tension: 0.35,
                pointRadius: 3,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: { legend: { position: 'bottom' } },
            scales: { y: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        });
      } else {
        chartSerieDiaria.data.labels = labels;
        chartSerieDiaria.data.datasets[0].data = sessoesData;
        chartSerieDiaria.data.datasets[1].data = unicosData;
        chartSerieDiaria.update('none');
      }
    }

    // 2. Gráfico Rosca — Dispositivos
    if (canvasDispositivos) {
      emptyDispositivos?.classList.toggle('hidden', dispositivos.length > 0);
      const labels = dispositivos.map((d) => formatDispositivoLabel(d.dispositivo_tipo));
      const values = dispositivos.map((d) => d.total_sessoes);
      const colors = ['#1E88E5', '#00E5FF', '#FF6D00', '#2C3E50'];

      if (!chartDispositivos) {
        chartDispositivos = new window.Chart(canvasDispositivos, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [
              {
                data: values,
                backgroundColor: colors,
                borderWidth: 2,
                borderColor: '#FFFFFF',
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: { legend: { position: 'bottom' } },
          },
        });
      } else {
        chartDispositivos.data.labels = labels;
        chartDispositivos.data.datasets[0].data = values;
        chartDispositivos.update('none');
      }
    }

    // 3a. Barras Horizontais — Top Localidades
    if (canvasLocalidades) {
      emptyLocalidades?.classList.toggle('hidden', localidades.length > 0);
      const labels = localidades.map((loc) => formatLocalidadeLabel(loc));
      const values = localidades.map((loc) => loc.total_sessoes);

      if (!chartLocalidades) {
        chartLocalidades = new window.Chart(canvasLocalidades, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Sessões',
                data: values,
                backgroundColor: 'rgba(30, 136, 229, 0.85)',
                borderRadius: 6,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        });
      } else {
        chartLocalidades.data.labels = labels;
        chartLocalidades.data.datasets[0].data = values;
        chartLocalidades.update('none');
      }
    }

    // 3b. Barras Horizontais — Páginas Mais Acessadas
    if (canvasPaginas) {
      emptyPaginas?.classList.toggle('hidden', paginas.length > 0);
      const labels = paginas.map((p) => p.pagina);
      const values = paginas.map((p) => p.total_acessos);

      if (!chartPaginas) {
        chartPaginas = new window.Chart(canvasPaginas, {
          type: 'bar',
          data: {
            labels,
            datasets: [
              {
                label: 'Acessos',
                data: values,
                backgroundColor: 'rgba(255, 109, 0, 0.85)',
                borderRadius: 6,
              },
            ],
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { x: { beginAtZero: true, ticks: { precision: 0 } } },
          },
        });
      } else {
        chartPaginas.data.labels = labels;
        chartPaginas.data.datasets[0].data = values;
        chartPaginas.update('none');
      }
    }
  }

  async function loadMetricas({ silent = false } = {}) {
    const dias = Number(metricasDiasSelect?.value || 7);
    if (!silent) showFeedback(metricasFeedback, '');

    try {
      const data = await apiRequest(`/admin/analytics/resumo?dias=${encodeURIComponent(dias)}`, {
        method: 'GET',
      });

      const kpis = data?.kpis || {};
      const online = Number(kpis.online_agora ?? 0);
      if (cardOnlineNum) cardOnlineNum.textContent = String(online);
      if (kpiOnlineAgora) kpiOnlineAgora.textContent = String(online);
      if (kpiSessoesHoje) kpiSessoesHoje.textContent = String(kpis.sessoes_hoje ?? 0);
      if (kpiAutenticadosHoje) {
        const aut = Number(kpis.usuarios_autenticados_hoje ?? 0);
        kpiAutenticadosHoje.textContent = `${aut} ${aut === 1 ? 'usuário autenticado hoje' : 'usuários autenticados hoje'}`;
      }
      if (kpiDuracaoMedia) kpiDuracaoMedia.textContent = formatDuracao(kpis.duracao_media_segundos);
      if (kpiPaginasSessao) {
        const mediaPag = Number(kpis.media_paginas_sessao ?? 0);
        kpiPaginasSessao.textContent = mediaPag.toFixed(1).replace('.', ',');
      }

      if (metricasUltimaAtualizacao) {
        const agora = new Date().toLocaleTimeString('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });
        metricasUltimaAtualizacao.textContent = `• Atualizado às ${agora}`;
      }

      if (activePanelKey === 'metricas') {
        renderMetricasCharts(data);
      }
    } catch (err) {
      if (!silent) {
        showFeedback(metricasFeedback, err.message || 'Erro ao carregar métricas.');
      }
    }
  }

  function stopMetricasPolling() {
    if (metricasPollTimer) {
      clearInterval(metricasPollTimer);
      metricasPollTimer = null;
    }
  }

  function startMetricasPolling() {
    stopMetricasPolling();
    if (activePanelKey !== 'metricas' || document.visibilityState !== 'visible') {
      return;
    }
    metricasPollTimer = window.setInterval(() => {
      if (activePanelKey === 'metricas' && document.visibilityState === 'visible') {
        loadMetricas({ silent: true });
      } else {
        stopMetricasPolling();
      }
    }, 10000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activePanelKey === 'metricas') {
      loadMetricas({ silent: true });
      startMetricasPolling();
    } else {
      stopMetricasPolling();
    }
  });

  metricasDiasSelect?.addEventListener('change', () => {
    loadMetricas({ silent: false });
  });

  btnAtualizarMetricas?.addEventListener('click', () => {
    loadMetricas({ silent: false });
  });

  async function handleDesativarQuestao(id) {
    const confirmed = window.confirm(
      'Deseja desativar esta questão? Ela não será sorteada em novos simulados, mas permanecerá preservada no histórico de simulados já finalizados.'
    );
    if (!confirmed) return;

    showFeedback(bancoFeedback, '');
    try {
      await apiRequest(`/admin/questoes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (questaoIdInput?.value === id) {
        resetQuestaoFormMode();
      }
      showFeedback(bancoFeedback, 'Questão desativada com sucesso.', 'success');
      await Promise.all([loadQuestoes(), loadCategorias()]);
    } catch (err) {
      showFeedback(bancoFeedback, err.message || 'Erro ao desativar questão.');
    }
  }

  async function handleReativarQuestao(q) {
    showFeedback(bancoFeedback, '');
    try {
      await apiRequest(`/admin/questoes/${encodeURIComponent(q.id)}`, {
        method: 'PUT',
        body: JSON.stringify({
          categoria_id: q.categoria_id,
          enunciado: q.enunciado,
          enunciado_imagem_url: q.enunciado_imagem_url || null,
          alternativa_a: q.alternativa_a,
          alternativa_a_imagem_url: q.alternativa_a_imagem_url || null,
          alternativa_b: q.alternativa_b,
          alternativa_b_imagem_url: q.alternativa_b_imagem_url || null,
          alternativa_c: q.alternativa_c,
          alternativa_c_imagem_url: q.alternativa_c_imagem_url || null,
          alternativa_d: q.alternativa_d,
          alternativa_d_imagem_url: q.alternativa_d_imagem_url || null,
          gabarito: q.gabarito,
          comentario: q.comentario,
          comentario_imagem_url: q.comentario_imagem_url || null,
          ativa: true,
        }),
      });
      showFeedback(bancoFeedback, 'Questão reativada com sucesso.', 'success');
      await Promise.all([loadQuestoes(), loadCategorias()]);
    } catch (err) {
      showFeedback(bancoFeedback, err.message || 'Erro ao reativar questão.');
    }
  }

  categoriaForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(categoriaFeedback, '');

    const licenca = catLicencaInput?.value.trim() || '';
    const materia = catMateriaInput?.value.trim() || '';

    if (!licenca || materia.length < 2) {
      showFeedback(categoriaFeedback, 'Informe uma licença e uma matéria válida.');
      return;
    }

    if (catSubmitBtn) catSubmitBtn.disabled = true;
    try {
      await apiRequest('/admin/categorias', {
        method: 'POST',
        body: JSON.stringify({ licenca, materia }),
      });
      if (catMateriaInput) catMateriaInput.value = '';
      showFeedback(categoriaFeedback, 'Categoria cadastrada com sucesso!', 'success');
      await loadCategorias();
    } catch (err) {
      showFeedback(categoriaFeedback, err.message || 'Erro ao cadastrar categoria.');
    } finally {
      if (catSubmitBtn) catSubmitBtn.disabled = false;
    }
  });

  questaoForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(questaoFeedback, '');

    if (activeUploadsCount > 0) {
      showFeedback(questaoFeedback, 'Aguarde o término do envio das imagens antes de salvar.');
      return;
    }

    const editId = questaoIdInput?.value.trim() || '';
    const payload = {
      categoria_id: categoriaIdSelect?.value.trim() || '',
      gabarito: gabaritoSelect?.value.trim() || '',
      enunciado: enunciadoInput?.value.trim() || '',
      enunciado_imagem_url: getImageFieldValue('enunciado_imagem_url'),
      alternativa_a: altAInput?.value.trim() || '',
      alternativa_a_imagem_url: getImageFieldValue('alternativa_a_imagem_url'),
      alternativa_b: altBInput?.value.trim() || '',
      alternativa_b_imagem_url: getImageFieldValue('alternativa_b_imagem_url'),
      alternativa_c: altCInput?.value.trim() || '',
      alternativa_c_imagem_url: getImageFieldValue('alternativa_c_imagem_url'),
      alternativa_d: altDInput?.value.trim() || '',
      alternativa_d_imagem_url: getImageFieldValue('alternativa_d_imagem_url'),
      comentario: comentarioInput?.value.trim() || '',
      comentario_imagem_url: getImageFieldValue('comentario_imagem_url'),
    };

    if (!payload.categoria_id) {
      showFeedback(questaoFeedback, 'Selecione uma categoria.');
      return;
    }

    if (questaoSubmitBtn) questaoSubmitBtn.disabled = true;
    try {
      if (editId) {
        await apiRequest(`/admin/questoes/${encodeURIComponent(editId)}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showFeedback(questaoFeedback, 'Questão atualizada com sucesso!', 'success');
      } else {
        await apiRequest('/admin/questoes', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showFeedback(questaoFeedback, 'Questão cadastrada com sucesso!', 'success');
      }

      resetQuestaoFormMode();
      await Promise.all([loadQuestoes(), loadCategorias()]);
    } catch (err) {
      showFeedback(questaoFeedback, err.message || 'Erro ao salvar questão.');
    } finally {
      if (questaoSubmitBtn) questaoSubmitBtn.disabled = false;
    }
  });

  filtroForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(bancoFeedback, '');
    try {
      await loadQuestoes();
    } catch (err) {
      showFeedback(bancoFeedback, err.message || 'Erro ao filtrar questões.');
    }
  });

  filtroCategoria?.addEventListener('change', () => loadQuestoes().catch(() => {}));
  filtroAtiva?.addEventListener('change', () => loadQuestoes().catch(() => {}));

  filtroLimparBtn?.addEventListener('click', () => {
    if (filtroCategoria) filtroCategoria.value = '';
    if (filtroAtiva) filtroAtiva.value = 'true';
    if (filtroBusca) filtroBusca.value = '';
    showFeedback(bancoFeedback, '');
    loadQuestoes().catch(() => {});
  });

  alunosFiltroForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showFeedback(alunosFeedback, '');
    try {
      await loadAlunos();
    } catch (err) {
      showFeedback(alunosFeedback, err.message || 'Erro ao buscar alunos.');
    }
  });

  alunosFiltroAtivo?.addEventListener('change', () => {
    showFeedback(alunosFeedback, '');
    loadAlunos().catch((err) => showFeedback(alunosFeedback, err.message || 'Erro ao filtrar alunos.'));
  });

  alunosLimparBtn?.addEventListener('click', () => {
    if (alunosBuscaInput) alunosBuscaInput.value = '';
    if (alunosFiltroAtivo) alunosFiltroAtivo.value = '';
    showFeedback(alunosFeedback, '');
    loadAlunos().catch(() => {});
  });

  async function initAdminPage() {
    if (!getToken()) {
      window.location.href = './login.html';
      return;
    }

    try {
      const me = await apiRequest('/auth/me', { method: 'GET' });
      const usuario = me?.usuario;
      if (!usuario || usuario.perfil !== 'ADMIN') {
        window.location.href = './login.html';
        return;
      }

      initNavbar(usuario);
      initImageWidgets();

      loadingEl?.classList.add('hidden');
      contentEl?.classList.remove('hidden');

      await Promise.all([loadCategorias(), loadQuestoes(), loadAlunos(), loadMetricas({ silent: true })]);
    } catch {
      window.location.href = './login.html';
    }
  }

  initAdminPage();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrapAdminPage);
} else {
  bootstrapAdminPage();
}
