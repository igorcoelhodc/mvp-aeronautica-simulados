// api.js — Cliente HTTP (fetch) com gestão de Bearer Token e revogação imediata de conta desabilitada

const API_BASE_URL = '/api';
const TOKEN_KEY = 'aero_simulados_token';
const AUTH_NOTICE_KEY = 'aero_auth_notice';

export class ApiError extends Error {
  constructor(message, status, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function setAuthNotice(message) {
  try {
    if (message) sessionStorage.setItem(AUTH_NOTICE_KEY, message);
  } catch {
    // Ignora erro de storage
  }
}

export function consumeAuthNotice() {
  try {
    const msg = sessionStorage.getItem(AUTH_NOTICE_KEY);
    if (msg) sessionStorage.removeItem(AUTH_NOTICE_KEY);
    return msg || '';
  } catch {
    return '';
  }
}

function isPublicPagePath() {
  const path = window.location.pathname.toLowerCase();
  return path === '/' || path.endsWith('/index.html') || path.endsWith('/login.html');
}

function handleAuthFailure(endpoint, status, data, message) {
  const isLoginOrRegister = endpoint.startsWith('/auth/login') || endpoint.startsWith('/auth/register');
  if (isLoginOrRegister) return;

  if (status === 401) {
    clearToken();
    return;
  }

  const isDisabledAccount =
    status === 403 &&
    (data?.code === 'ACCOUNT_DISABLED' ||
      (typeof message === 'string' && message.toLowerCase().includes('conta desabilitada')));

  if (isDisabledAccount) {
    clearToken();
    setAuthNotice(message);
    if (!isPublicPagePath()) {
      window.location.href = './login.html';
    }
  }
}

export async function apiRequest(endpoint, options = {}) {
  const { headers: customHeaders = {}, ...fetchOptions } = options;
  const token = getToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...customHeaders,
  };

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error || data?.message || 'Erro inesperado ao comunicar com a API.';
    handleAuthFailure(endpoint, response.status, data, message);
    throw new ApiError(message, response.status, data);
  }

  return data;
}

export async function apiUpload(endpoint, formData) {
  const token = getToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers,
    body: formData,
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message = data?.error || data?.message || 'Erro ao enviar arquivo para a API.';
    handleAuthFailure(endpoint, response.status, data, message);
    throw new ApiError(message, response.status, data);
  }

  return data;
}
