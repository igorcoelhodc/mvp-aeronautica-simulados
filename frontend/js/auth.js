// auth.js — Lógica das abas de Login/Cadastro e validação de sessão (/api/auth/me)

import { apiRequest, clearToken, consumeAuthNotice, getToken, setToken } from './api.js';
import { initNavbar } from './navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  const authCard = document.getElementById('auth-card');
  const sessionPanel = document.getElementById('session-panel');
  const tabButtons = document.querySelectorAll('[data-auth-tab]');
  const form = document.getElementById('login-form');
  const nomeField = document.getElementById('nome-field');
  const nomeInput = document.getElementById('nome');
  const emailInput = document.getElementById('email');
  const senhaInput = document.getElementById('senha');
  const senhaHint = document.getElementById('senha-hint');
  const submitBtn = document.getElementById('auth-submit-btn');
  const submitLabel = document.getElementById('auth-submit-label');
  const feedbackEl = document.getElementById('auth-feedback');

  const sessionNome = document.getElementById('session-nome');
  const sessionEmail = document.getElementById('session-email');
  const sessionPerfil = document.getElementById('session-perfil');
  const adminPanelLink = document.getElementById('admin-panel-link');
  const logoutBtn = document.getElementById('logout-btn');

  let currentMode = 'login';

  function setFeedback(message, type = 'error') {
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

  function setLoading(isLoading) {
    if (!submitBtn || !submitLabel) return;
    submitBtn.disabled = isLoading;
    submitBtn.classList.toggle('opacity-70', isLoading);
    submitBtn.classList.toggle('cursor-not-allowed', isLoading);

    if (isLoading) {
      submitLabel.textContent = currentMode === 'register' ? 'Criando conta...' : 'Entrando...';
    } else {
      submitLabel.textContent = currentMode === 'register' ? 'Criar Conta Gratuita' : 'Entrar na Plataforma';
    }
  }

  function setMode(mode) {
    currentMode = mode === 'register' ? 'register' : 'login';
    setFeedback('');

    tabButtons.forEach((btn) => {
      const isActive = btn.dataset.authTab === currentMode;
      btn.classList.toggle('bg-primary', isActive);
      btn.classList.toggle('text-white', isActive);
      btn.classList.toggle('shadow-sm', isActive);
      btn.classList.toggle('text-carbon/70', !isActive);
      btn.setAttribute('aria-selected', String(isActive));
    });

    const isRegister = currentMode === 'register';
    nomeField?.classList.toggle('hidden', !isRegister);
    senhaHint?.classList.toggle('hidden', !isRegister);

    if (nomeInput) {
      nomeInput.required = isRegister;
    }
    if (senhaInput) {
      senhaInput.minLength = isRegister ? 8 : 1;
      senhaInput.autocomplete = isRegister ? 'new-password' : 'current-password';
    }
    if (submitLabel) {
      submitLabel.textContent = isRegister ? 'Criar Conta Gratuita' : 'Entrar na Plataforma';
    }
  }

  function showSession(usuario) {
    if (!authCard || !sessionPanel) return;
    if (sessionNome) sessionNome.textContent = usuario.nome;
    if (sessionEmail) sessionEmail.textContent = usuario.email;
    if (sessionPerfil) sessionPerfil.textContent = usuario.perfil;

    if (adminPanelLink) {
      const isAdmin = usuario.perfil === 'ADMIN';
      adminPanelLink.classList.toggle('hidden', !isAdmin);
      adminPanelLink.classList.toggle('flex', isAdmin);
    }

    authCard.classList.add('hidden');
    sessionPanel.classList.remove('hidden');
  }

  function showAuthForm() {
    if (!authCard || !sessionPanel) return;
    sessionPanel.classList.add('hidden');
    authCard.classList.remove('hidden');
  }

  async function verifyExistingSession() {
    if (!getToken()) {
      showAuthForm();
      const notice = consumeAuthNotice();
      if (notice) setFeedback(notice, 'error');
      return;
    }

    try {
      const data = await apiRequest('/auth/me', { method: 'GET' });
      if (data?.usuario) {
        showSession(data.usuario);
        return;
      }
      clearToken();
      showAuthForm();
    } catch (err) {
      clearToken();
      showAuthForm();
      initNavbar(null);
      const notice = consumeAuthNotice() || (err?.status === 403 ? err.message : '');
      if (notice) setFeedback(notice, 'error');
    }
  }

  tabButtons.forEach((btn) => {
    btn.addEventListener('click', () => setMode(btn.dataset.authTab));
  });

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      clearToken();
      form?.reset();
      setMode('login');
      showAuthForm();
      initNavbar();
      setFeedback('Você saiu da sua conta.', 'success');
    });
  }

  if (form) {
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      setFeedback('');

      const email = emailInput?.value.trim() || '';
      const senha = senhaInput?.value || '';

      if (currentMode === 'register') {
        const nome = nomeInput?.value.trim() || '';
        if (nome.length < 2) {
          setFeedback('Informe seu nome completo (pelo menos 2 caracteres).');
          nomeInput?.focus();
          return;
        }
        if (senha.length < 8) {
          setFeedback('A senha deve ter pelo menos 8 caracteres.');
          senhaInput?.focus();
          return;
        }
      }

      setLoading(true);
      try {
        const endpoint = currentMode === 'register' ? '/auth/register' : '/auth/login';
        const payload =
          currentMode === 'register'
            ? { nome: nomeInput?.value.trim() || '', email, senha }
            : { email, senha };

        const data = await apiRequest(endpoint, {
          method: 'POST',
          body: JSON.stringify(payload),
        });

        // Novos cadastros entram com ativo = FALSE aguardando liberação manual do admin
        if (currentMode === 'register' && (data?.aguardando_aprovacao || !data?.token)) {
          form.reset();
          setMode('login');
          setFeedback(
            data?.message ||
              'Cadastro realizado com sucesso! Sua conta está aguardando liberação do instrutor para acessar os simulados.',
            'success'
          );
          return;
        }

        setToken(data.token);

        const meData = await apiRequest('/auth/me', { method: 'GET' });
        const usuario = meData?.usuario || data.usuario;

        if (usuario?.perfil === 'ADMIN') {
          showSession(usuario);
          initNavbar(usuario);
        } else {
          window.location.href = './dashboard.html';
        }
      } catch (err) {
        setFeedback(err.message || 'Não foi possível concluir a autenticação.');
      } finally {
        setLoading(false);
      }
    });
  }

  const params = new URLSearchParams(window.location.search);
  setMode(params.get('tab') === 'register' ? 'register' : 'login');
  verifyExistingSession();
});
