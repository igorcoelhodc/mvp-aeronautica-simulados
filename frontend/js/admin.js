// admin.js — Curadoria Administrativa (Categorias + CRUD de Questões Comentadas com Imagens)

import { apiRequest, apiUpload, clearToken, getToken } from './api.js';

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

document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('admin-loading');
  const contentEl = document.getElementById('admin-content');
  const userBadge = document.getElementById('admin-user-badge');
  const userNameEl = document.getElementById('admin-user-name');
  const logoutBtn = document.getElementById('admin-logout-btn');
  const logoutBtnMobile = document.getElementById('admin-logout-btn-mobile');

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

  // Filtros e Listagem
  const filtroForm = document.getElementById('filtro-form');
  const filtroCategoria = document.getElementById('filtro-categoria');
  const filtroAtiva = document.getElementById('filtro-ativa');
  const filtroBusca = document.getElementById('filtro-busca');
  const filtroLimparBtn = document.getElementById('filtro-limpar-btn');
  const questoesCountBadge = document.getElementById('questoes-count-badge');
  const listaQuestoesEl = document.getElementById('lista-questoes');

  const imageWidgets = new Map();
  let activeUploadsCount = 0;

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

  function handleLogout() {
    clearToken();
    window.location.href = './login.html';
  }

  logoutBtn?.addEventListener('click', handleLogout);
  logoutBtnMobile?.addEventListener('click', handleLogout);

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

      triggerBtn.addEventListener('click', () => {
        fileInput.click();
      });

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
    questaoEditBadge?.classList.remove('hidden');
    questaoEditBadge?.classList.add('inline-flex');
    questaoCancelBtn?.classList.remove('hidden');
    showFeedback(questaoFeedback, '');

    document.getElementById('secao-questao-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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

  function renderCategorias(categorias) {
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

        const sep = document.createTextNode(` • ${cat.materia}`);
        chip.append(lic, sep);
        categoriasChips.appendChild(chip);
      });
    }
  }

  function renderQuestoes(questoes) {
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
      sub.textContent = 'Ajuste os filtros ou cadastre uma nova questão acima.';

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

      // Cabeçalho do card
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
      }

      header.append(badges, actions);

      // Enunciado + imagem opcional
      const enunciadoWrap = document.createElement('div');
      enunciadoWrap.className = 'mb-4';

      const enunciadoEl = document.createElement('h3');
      enunciadoEl.className = 'font-poppins font-semibold text-base text-carbon leading-relaxed';
      enunciadoEl.textContent = q.enunciado;
      enunciadoWrap.appendChild(enunciadoEl);

      const enunThumb = createAdminThumb(q.enunciado_imagem_url, 'Imagem do enunciado', 'max-h-40');
      if (enunThumb) enunciadoWrap.appendChild(enunThumb);

      // Alternativas + imagens opcionais
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

      // Comentário + imagem opcional
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

  async function handleDesativarQuestao(id) {
    const confirmed = window.confirm(
      'Deseja desativar esta questão? Ela não será sorteada em novos simulados, mas permanecerá preservada no histórico de simulados já finalizados.'
    );
    if (!confirmed) return;

    try {
      await apiRequest(`/admin/questoes/${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (questaoIdInput?.value === id) {
        resetQuestaoFormMode();
      }
      showFeedback(questaoFeedback, 'Questão desativada com sucesso.', 'success');
      await loadQuestoes();
    } catch (err) {
      showFeedback(questaoFeedback, err.message || 'Erro ao desativar questão.');
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
      await loadQuestoes();
    } catch (err) {
      showFeedback(questaoFeedback, err.message || 'Erro ao salvar questão.');
    } finally {
      if (questaoSubmitBtn) questaoSubmitBtn.disabled = false;
    }
  });

  filtroForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      await loadQuestoes();
    } catch (err) {
      showFeedback(questaoFeedback, err.message || 'Erro ao filtrar questões.');
    }
  });

  filtroCategoria?.addEventListener('change', () => loadQuestoes().catch(() => {}));
  filtroAtiva?.addEventListener('change', () => loadQuestoes().catch(() => {}));

  filtroLimparBtn?.addEventListener('click', () => {
    if (filtroCategoria) filtroCategoria.value = '';
    if (filtroAtiva) filtroAtiva.value = 'true';
    if (filtroBusca) filtroBusca.value = '';
    loadQuestoes().catch(() => {});
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

      if (userNameEl) userNameEl.textContent = usuario.nome;
      userBadge?.classList.remove('hidden');
      userBadge?.classList.add('inline-flex');

      initImageWidgets();

      loadingEl?.classList.add('hidden');
      contentEl?.classList.remove('hidden');

      await loadCategorias();
      await loadQuestoes();
    } catch {
      window.location.href = './login.html';
    }
  }

  initAdminPage();
});
