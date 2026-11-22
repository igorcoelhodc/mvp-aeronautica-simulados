// admin.js — Curadoria Administrativa (Categorias + CRUD de Questões Comentadas)

import { apiRequest, clearToken, getToken } from './api.js';

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

  let questoesCache = [];

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

  function resetQuestaoFormMode() {
    questaoForm?.reset();
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
    questoesCache = questoes;

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

      const actions = document.createElement('div');
      actions.className = 'flex items-center gap-2';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'px-3.5 py-1.5 rounded-xl bg-white border border-gray-200 text-xs font-poppins font-semibold text-carbon hover:border-primary hover:text-primary transition-colors flex items-center gap-1.5';
      editBtn.innerHTML = '<i class="ph-bold ph-pencil-simple"></i> Editar';
      editBtn.addEventListener('click', () => enterEditMode(q));
      actions.appendChild(editBtn);

      if (q.ativa) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'px-3.5 py-1.5 rounded-xl bg-white border border-red-200 text-xs font-poppins font-semibold text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1.5';
        delBtn.innerHTML = '<i class="ph-bold ph-eye-slash"></i> Desativar';
        delBtn.addEventListener('click', () => handleDesativarQuestao(q.id));
        actions.appendChild(delBtn);
      }

      header.append(badges, actions);

      // Enunciado
      const enunciadoEl = document.createElement('h3');
      enunciadoEl.className = 'font-poppins font-semibold text-base text-carbon leading-relaxed mb-4';
      enunciadoEl.textContent = q.enunciado;

      // Alternativas
      const altsGrid = document.createElement('div');
      altsGrid.className = 'grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4 text-sm';

      const alts = [
        ['A', q.alternativa_a],
        ['B', q.alternativa_b],
        ['C', q.alternativa_c],
        ['D', q.alternativa_d],
      ];

      alts.forEach(([letra, texto]) => {
        const isCorrect = q.gabarito === letra;
        const altItem = document.createElement('div');
        altItem.className = isCorrect
          ? 'p-3 rounded-xl border border-primary/50 bg-primary/10 text-carbon font-medium'
          : 'p-3 rounded-xl border border-gray-200/80 bg-white text-carbon/85';

        const strong = document.createElement('strong');
        strong.className = isCorrect ? 'text-primary font-poppins mr-1.5' : 'text-carbon/70 font-poppins mr-1.5';
        strong.textContent = `${letra})`;

        altItem.append(strong, document.createTextNode(texto));
        altsGrid.appendChild(altItem);
      });

      // Comentário
      const comentarioBox = document.createElement('div');
      comentarioBox.className = 'p-3.5 rounded-xl glass-dark text-xs sm:text-sm text-carbon/85 leading-relaxed';

      const comLabel = document.createElement('strong');
      comLabel.className = 'text-primary font-poppins mr-1.5';
      comLabel.textContent = 'Comentário:';

      comentarioBox.append(comLabel, document.createTextNode(q.comentario));

      card.append(header, enunciadoEl, altsGrid, comentarioBox);
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

    const editId = questaoIdInput?.value.trim() || '';
    const payload = {
      categoria_id: categoriaIdSelect?.value.trim() || '',
      gabarito: gabaritoSelect?.value.trim() || '',
      enunciado: enunciadoInput?.value.trim() || '',
      alternativa_a: altAInput?.value.trim() || '',
      alternativa_b: altBInput?.value.trim() || '',
      alternativa_c: altCInput?.value.trim() || '',
      alternativa_d: altDInput?.value.trim() || '',
      comentario: comentarioInput?.value.trim() || '',
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
