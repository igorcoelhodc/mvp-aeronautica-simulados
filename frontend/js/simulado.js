// simulado.js — Execução de Simulado com Cronômetro Regressivo (30 min) e Gabarito Comentado

import { apiRequest, getToken } from './api.js';

document.addEventListener('DOMContentLoaded', () => {
  const loadingEl = document.getElementById('simulado-loading');
  const erroEl = document.getElementById('simulado-erro');
  const erroMsgEl = document.getElementById('simulado-erro-msg');
  const mainEl = document.getElementById('simulado-main');

  const progressBadge = document.getElementById('progress-badge');
  const timerBox = document.getElementById('timer-box');
  const timerDisplay = document.getElementById('timer-display');
  const avisoEl = document.getElementById('simulado-aviso');

  // Execução
  const modoExecucao = document.getElementById('modo-execucao');
  const simuladoBancaEl = document.getElementById('simulado-banca');
  const progressBarEl = document.getElementById('progress-bar');
  const progressPercentEl = document.getElementById('progress-percent');
  const enunciadoEl = document.getElementById('questao-enunciado');
  const alternativasListaEl = document.getElementById('alternativas-lista');
  const btnAnterior = document.getElementById('btn-anterior');
  const btnProxima = document.getElementById('btn-proxima');
  const btnFinalizar = document.getElementById('btn-finalizar');
  const btnFinalizarLabel = document.getElementById('btn-finalizar-label');
  const respondidasResumoEl = document.getElementById('respondidas-resumo');
  const questoesNavEl = document.getElementById('questoes-nav');

  // Resultado
  const modoResultado = document.getElementById('modo-resultado');
  const resultadoCategoriaEl = document.getElementById('resultado-categoria');
  const resultadoStatusBadge = document.getElementById('resultado-status-badge');
  const resultadoTituloEl = document.getElementById('resultado-titulo');
  const resultadoSubtituloEl = document.getElementById('resultado-subtitulo');
  const resultadoPercentualEl = document.getElementById('resultado-percentual');
  const resultadoAcertosEl = document.getElementById('resultado-acertos');
  const gabaritoDetalhesEl = document.getElementById('gabarito-detalhes');

  let simuladoId = null;
  let simuladoAtual = null;
  let questoes = [];
  let respostas = {};
  let currentIndex = 0;
  let remainingSeconds = 0;
  let timerInterval = null;
  let isFinalizing = false;

  function storageKey() {
    return `aero_simulado_respostas_${simuladoId}`;
  }

  function loadLocalRespostas() {
    try {
      const raw = sessionStorage.getItem(storageKey());
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveLocalRespostas() {
    try {
      sessionStorage.setItem(storageKey(), JSON.stringify(respostas));
    } catch {
      // Ignora erro de quota do sessionStorage
    }
  }

  function clearLocalRespostas() {
    try {
      sessionStorage.removeItem(storageKey());
    } catch {
      // Ignora erro
    }
  }

  function showFatalError(message) {
    loadingEl?.classList.add('hidden');
    mainEl?.classList.add('hidden');
    if (erroMsgEl) erroMsgEl.textContent = message;
    erroEl?.classList.remove('hidden');
  }

  function showAviso(message) {
    if (!avisoEl) return;
    if (!message) {
      avisoEl.classList.add('hidden');
      avisoEl.replaceChildren();
      return;
    }
    avisoEl.replaceChildren();
    const icon = document.createElement('i');
    icon.className = 'ph-fill ph-info text-lg shrink-0';
    avisoEl.append(icon, document.createTextNode(message));
    avisoEl.classList.remove('hidden');
  }

  function formatMMSS(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const min = String(Math.floor(safe / 60)).padStart(2, '0');
    const sec = String(safe % 60).padStart(2, '0');
    return `${min}:${sec}`;
  }

  function formatPercent(val) {
    const num = Number(val || 0);
    return `${Number.isInteger(num) ? num : num.toFixed(1).replace('.', ',')}%`;
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerUI() {
    if (!timerDisplay || !timerBox) return;
    timerDisplay.textContent = formatMMSS(remainingSeconds);

    if (remainingSeconds <= 300) {
      timerBox.classList.remove('border-primary/20', 'text-carbon');
      timerBox.classList.add('border-red-300', 'bg-red-50', 'text-red-700');
    } else {
      timerBox.classList.remove('border-red-300', 'bg-red-50', 'text-red-700');
      timerBox.classList.add('border-primary/20', 'text-carbon');
    }
  }

  function startCountdown(seconds) {
    stopTimer();
    remainingSeconds = Math.max(0, Number(seconds || 0));
    timerBox?.classList.remove('hidden');
    timerBox?.classList.add('flex');
    updateTimerUI();

    if (remainingSeconds <= 0) {
      finalizarSimulado(true);
      return;
    }

    timerInterval = setInterval(() => {
      remainingSeconds -= 1;
      updateTimerUI();

      if (remainingSeconds <= 0) {
        stopTimer();
        finalizarSimulado(true);
      }
    }, 1000);
  }

  function updateProgress() {
    const total = questoes.length;
    const answered = questoes.filter((q) => Boolean(respostas[q.id])).length;
    const pct = total ? Math.round((answered / total) * 100) : 0;

    if (progressBadge) {
      progressBadge.textContent = `Questão ${currentIndex + 1} de ${total}`;
      progressBadge.classList.remove('hidden');
    }
    if (progressBarEl) progressBarEl.style.width = `${pct}%`;
    if (progressPercentEl) progressPercentEl.textContent = `${pct}%`;
    if (respondidasResumoEl) respondidasResumoEl.textContent = `${answered} de ${total} respondidas`;
  }

  function renderNavPills() {
    if (!questoesNavEl) return;
    questoesNavEl.replaceChildren();

    questoes.forEach((q, idx) => {
      const isCurrent = idx === currentIndex;
      const isAnswered = Boolean(respostas[q.id]);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = String(idx + 1);
      btn.setAttribute('aria-label', `Ir para questão ${idx + 1}`);

      if (isCurrent) {
        btn.className = 'w-10 h-10 rounded-xl font-poppins font-bold text-sm bg-primary text-white shadow-md shadow-primary/30 transition-all';
      } else if (isAnswered) {
        btn.className = 'w-10 h-10 rounded-xl font-poppins font-semibold text-sm bg-primary/15 text-primary border border-primary/40 hover:bg-primary/25 transition-all';
      } else {
        btn.className = 'w-10 h-10 rounded-xl font-poppins font-medium text-sm bg-white/80 text-carbon/70 border border-gray-200 hover:border-primary hover:text-primary transition-all';
      }

      btn.addEventListener('click', () => {
        currentIndex = idx;
        renderCurrentQuestion();
      });

      questoesNavEl.appendChild(btn);
    });
  }

  function renderCurrentQuestion() {
    const q = questoes[currentIndex];
    if (!q) return;

    if (enunciadoEl) {
      enunciadoEl.textContent = `${currentIndex + 1}. ${q.enunciado}`;
    }

    if (alternativasListaEl) {
      alternativasListaEl.replaceChildren();

      const alts = [
        ['A', q.alternativa_a],
        ['B', q.alternativa_b],
        ['C', q.alternativa_c],
        ['D', q.alternativa_d],
      ];
      const selecionada = respostas[q.id] || null;

      alts.forEach(([letra, texto]) => {
        const isSelected = selecionada === letra;

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = isSelected
          ? 'w-full text-left p-4 rounded-xl border-2 border-primary bg-primary/10 cursor-pointer flex items-center gap-3 relative overflow-hidden shadow-sm transition-all'
          : 'w-full text-left p-4 rounded-xl border-2 border-white/60 bg-white/70 cursor-pointer hover:border-primary transition-all flex items-center gap-3';

        if (isSelected) {
          const rightBar = document.createElement('div');
          rightBar.className = 'absolute right-0 top-0 bottom-0 w-1 bg-primary';
          btn.appendChild(rightBar);

          const checkIcon = document.createElement('i');
          checkIcon.className = 'ph-fill ph-check-circle text-primary text-xl shrink-0';
          btn.appendChild(checkIcon);
        } else {
          const circle = document.createElement('div');
          circle.className = 'w-5 h-5 rounded-full border-2 border-carbon/30 bg-white shrink-0';
          btn.appendChild(circle);
        }

        const span = document.createElement('span');
        span.className = isSelected
          ? 'text-sm sm:text-base font-medium text-primary'
          : 'text-sm sm:text-base font-medium text-carbon';

        const letraEl = document.createElement('strong');
        letraEl.className = 'font-poppins mr-1.5';
        letraEl.textContent = `${letra})`;

        span.append(letraEl, document.createTextNode(texto));
        btn.appendChild(span);

        btn.addEventListener('click', () => {
          respostas[q.id] = letra;
          saveLocalRespostas();
          renderCurrentQuestion();
        });

        alternativasListaEl.appendChild(btn);
      });
    }

    if (btnAnterior) btnAnterior.disabled = currentIndex === 0;
    if (btnProxima) btnProxima.disabled = currentIndex >= questoes.length - 1;

    updateProgress();
    renderNavPills();
  }

  function renderResultado(simulado, revisao) {
    stopTimer();
    clearLocalRespostas();

    modoExecucao?.classList.add('hidden');
    timerBox?.classList.add('hidden');
    progressBadge?.classList.add('hidden');
    modoResultado?.classList.remove('hidden');

    const aprovado = Boolean(simulado.aprovado);
    const acertos = simulado.acertos ?? 0;
    const total = simulado.total_questoes ?? revisao.length;

    if (resultadoCategoriaEl) {
      resultadoCategoriaEl.textContent = `${simulado.categoria_licenca} • ${simulado.categoria_materia}`;
    }

    if (resultadoStatusBadge) {
      resultadoStatusBadge.className = aprovado
        ? 'px-3.5 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-poppins font-bold'
        : 'px-3.5 py-1 rounded-full bg-red-100 text-red-700 text-xs font-poppins font-bold';
      resultadoStatusBadge.textContent = aprovado ? 'Aprovado (>= 70%)' : 'Reprovado (< 70%)';
    }

    if (resultadoTituloEl) {
      resultadoTituloEl.textContent = aprovado ? 'Parabéns! Você foi aprovado.' : 'Continue treinando — você chega lá!';
    }

    if (resultadoSubtituloEl) {
      resultadoSubtituloEl.textContent = aprovado
        ? 'Você atingiu o critério mínimo de 70% de acertos. Revise os comentários abaixo para consolidar o conteúdo.'
        : 'O critério mínimo de aprovação é 70%. Analise os comentários de cada questão para corrigir os pontos fracos.';
    }

    if (resultadoPercentualEl) {
      resultadoPercentualEl.textContent = formatPercent(simulado.nota_percentual);
      resultadoPercentualEl.className = `font-poppins font-extrabold text-4xl ${
        aprovado ? 'text-emerald-600' : 'text-accent'
      }`;
    }

    if (resultadoAcertosEl) {
      resultadoAcertosEl.textContent = `${acertos} de ${total} acertos`;
    }

    if (!gabaritoDetalhesEl) return;
    gabaritoDetalhesEl.replaceChildren();

    revisao.forEach((item, idx) => {
      const card = document.createElement('article');
      card.className = `rounded-2xl p-6 border ${
        item.correta ? 'bg-cloud border-emerald-200/90' : 'bg-cloud border-red-200/90'
      }`;

      const top = document.createElement('div');
      top.className = 'flex flex-wrap items-center justify-between gap-2 mb-3';

      const numLabel = document.createElement('span');
      numLabel.className = 'font-poppins font-bold text-sm text-primary';
      numLabel.textContent = `Questão ${idx + 1}`;

      const badges = document.createElement('div');
      badges.className = 'flex flex-wrap items-center gap-2';

      const statusPill = document.createElement('span');
      if (item.correta) {
        statusPill.className = 'px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold';
        statusPill.textContent = 'Correta';
      } else if (!item.alternativa_marcada) {
        statusPill.className = 'px-3 py-1 rounded-full bg-gray-200 text-gray-700 text-xs font-semibold';
        statusPill.textContent = 'Em branco';
      } else {
        statusPill.className = 'px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold';
        statusPill.textContent = `Marcada: ${item.alternativa_marcada}`;
      }

      const gabPill = document.createElement('span');
      gabPill.className = 'px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-poppins font-bold';
      gabPill.textContent = `Gabarito: ${item.gabarito}`;

      badges.append(statusPill, gabPill);
      top.append(numLabel, badges);

      const enun = document.createElement('h3');
      enun.className = 'font-poppins font-semibold text-base text-carbon leading-relaxed mb-4';
      enun.textContent = item.enunciado;

      const altsWrap = document.createElement('div');
      altsWrap.className = 'grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-4 text-sm';

      const alts = [
        ['A', item.alternativa_a],
        ['B', item.alternativa_b],
        ['C', item.alternativa_c],
        ['D', item.alternativa_d],
      ];

      alts.forEach(([letra, texto]) => {
        const isGabarito = item.gabarito === letra;
        const isMarcada = item.alternativa_marcada === letra;

        const row = document.createElement('div');
        if (isGabarito) {
          row.className = 'p-3 rounded-xl border-2 border-emerald-400 bg-emerald-50 text-emerald-900 font-medium flex items-start gap-2';
        } else if (isMarcada && !isGabarito) {
          row.className = 'p-3 rounded-xl border-2 border-red-300 bg-red-50 text-red-900 font-medium flex items-start gap-2';
        } else {
          row.className = 'p-3 rounded-xl border border-gray-200 bg-white text-carbon/80 flex items-start gap-2';
        }

        const strong = document.createElement('strong');
        strong.className = 'font-poppins shrink-0';
        strong.textContent = `${letra})`;

        row.append(strong, document.createTextNode(texto));
        altsWrap.appendChild(row);
      });

      const comentarioBox = document.createElement('div');
      comentarioBox.className = 'p-4 rounded-xl glass-dark text-xs sm:text-sm text-carbon/90 leading-relaxed';

      const comTitle = document.createElement('strong');
      comTitle.className = 'text-primary font-poppins mr-1.5';
      comTitle.textContent = 'Comentário Técnico:';

      comentarioBox.append(comTitle, document.createTextNode(item.comentario));

      card.append(top, enun, altsWrap, comentarioBox);
      gabaritoDetalhesEl.appendChild(card);
    });
  }

  async function finalizarSimulado(autoExpired = false) {
    if (isFinalizing) return;

    if (!autoExpired) {
      const emBranco = questoes.filter((q) => !respostas[q.id]).length;
      const msg =
        emBranco > 0
          ? `Você ainda tem ${emBranco} ${
              emBranco === 1 ? 'questão em branco' : 'questões em branco'
            } (questões em branco contam como incorretas). Deseja finalizar e corrigir agora?`
          : 'Deseja finalizar o simulado e ver o gabarito comentado agora?';

      if (!window.confirm(msg)) {
        return;
      }
    } else {
      showAviso('Tempo limite de 30 minutos encerrado! Seu simulado foi finalizado automaticamente.');
    }

    isFinalizing = true;
    stopTimer();
    if (btnFinalizar) btnFinalizar.disabled = true;
    if (btnFinalizarLabel) btnFinalizarLabel.textContent = 'Corrigindo...';

    try {
      const data = await apiRequest(`/simulados/${encodeURIComponent(simuladoId)}/finalizar`, {
        method: 'POST',
        body: JSON.stringify({ respostas }),
      });

      simuladoAtual = data.simulado;
      renderResultado(data.simulado, data.revisao || []);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      isFinalizing = false;
      if (btnFinalizar) btnFinalizar.disabled = false;
      if (btnFinalizarLabel) btnFinalizarLabel.textContent = 'Finalizar e Corrigir';
      showAviso(err.message || 'Não foi possível finalizar o simulado. Tente novamente.');
    }
  }

  btnAnterior?.addEventListener('click', () => {
    if (currentIndex > 0) {
      currentIndex -= 1;
      renderCurrentQuestion();
    }
  });

  btnProxima?.addEventListener('click', () => {
    if (currentIndex < questoes.length - 1) {
      currentIndex += 1;
      renderCurrentQuestion();
    }
  });

  btnFinalizar?.addEventListener('click', () => finalizarSimulado(false));

  async function initSimulado() {
    if (!getToken()) {
      window.location.href = './login.html';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    simuladoId = params.get('id')?.trim() || '';
    if (!simuladoId) {
      window.location.href = './dashboard.html';
      return;
    }

    try {
      const me = await apiRequest('/auth/me', { method: 'GET' });
      if (!me?.usuario) {
        window.location.href = './login.html';
        return;
      }

      const data = await apiRequest(`/simulados/${encodeURIComponent(simuladoId)}`, {
        method: 'GET',
      });

      simuladoAtual = data?.simulado;
      if (!simuladoAtual) {
        showFatalError('Simulado não encontrado.');
        return;
      }

      loadingEl?.classList.add('hidden');
      mainEl?.classList.remove('hidden');

      if (simuladoAtual.status === 'FINALIZADO') {
        renderResultado(simuladoAtual, data.revisao || []);
        return;
      }

      questoes = data.questoes || [];
      if (!questoes.length) {
        showFatalError('Este simulado não possui questões vinculadas.');
        return;
      }

      // Mescla respostas salvas no servidor (se houver) com rascunho local da aba
      respostas = loadLocalRespostas();
      questoes.forEach((q) => {
        if (q.alternativa_marcada && !respostas[q.id]) {
          respostas[q.id] = q.alternativa_marcada;
        }
      });

      if (simuladoBancaEl) {
        simuladoBancaEl.textContent = `${simuladoAtual.categoria_licenca} • ${simuladoAtual.categoria_materia}`;
      }

      if (data.aviso) {
        showAviso(data.aviso);
      }

      modoExecucao?.classList.remove('hidden');
      currentIndex = 0;
      renderCurrentQuestion();

      const segundosRestantes =
        simuladoAtual.tempo_restante_segundos ?? simuladoAtual.tempo_limite_minutos * 60;
      startCountdown(segundosRestantes);
    } catch (err) {
      showFatalError(err.message || 'Erro ao carregar o simulado.');
    }
  }

  initSimulado();
});
