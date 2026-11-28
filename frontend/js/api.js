// api.js — Cliente HTTP (fetch) com gestão de Bearer Token

const API_BASE_URL = '/api';
const TOKEN_KEY = 'aero_simulados_token';

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
    if (response.status === 401 && !endpoint.startsWith('/auth/login') && !endpoint.startsWith('/auth/register')) {
      clearToken();
    }
    const message = data?.error || data?.message || 'Erro inesperado ao comunicar com a API.';
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
    if (response.status === 401) {
      clearToken();
    }
    const message = data?.error || data?.message || 'Erro ao enviar arquivo para a API.';
    throw new ApiError(message, response.status, data);
  }

  return data;
}
