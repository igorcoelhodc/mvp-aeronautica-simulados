// telemetry.js — Coletor leve e silencioso de telemetria de acesso (schema analytics)

import { getToken } from './api.js';

const TELEMETRY_ENDPOINT = '/api/telemetry/events';
const SESSION_KEY = 'aero_telemetry_session_id';
const HEARTBEAT_INTERVAL_MS = 30000;

let initialized = false;
let lastEndSentAt = 0;

function generateUUIDv4() {
  try {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

function getOrCreateSessionId() {
  try {
    const existing = sessionStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const created = generateUUIDv4();
    if (!created) return null;
    sessionStorage.setItem(SESSION_KEY, created);
    return created;
  } catch {
    return generateUUIDv4();
  }
}

function buildPayload(sessionId, eventType) {
  let timezone = '';
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    timezone = '';
  }

  return {
    session_id: sessionId,
    event_type: eventType,
    pagina: window.location.pathname || '/',
    fuso_horario: timezone,
    tela_largura: Number(window.screen?.width) || null,
    tela_altura: Number(window.screen?.height) || null,
    viewport_largura: Number(window.innerWidth) || null,
    viewport_altura: Number(window.innerHeight) || null,
  };
}

function sendViaFetch(payload) {
  try {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    fetch(TELEMETRY_ENDPOINT, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // Falha silenciosa — telemetria nunca deve impactar o usuário
  }
}

function sendEndBeacon(sessionId) {
  try {
    const now = Date.now();
    if (now - lastEndSentAt < 2000) return;
    lastEndSentAt = now;

    const payload = buildPayload(sessionId, 'end');
    const body = JSON.stringify(payload);

    if (navigator && typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([body], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(TELEMETRY_ENDPOINT, blob);
      return;
    }

    sendViaFetch(payload);
  } catch {
    // Falha silenciosa
  }
}

export function initTelemetry() {
  if (initialized) return;
  initialized = true;

  try {
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return;

    // 1. Pageview imediato ao carregar a página
    sendViaFetch(buildPayload(sessionId, 'pageview'));

    // 2. Heartbeat a cada 30s somente enquanto a aba estiver visível
    window.setInterval(() => {
      try {
        if (document.visibilityState === 'visible') {
          sendViaFetch(buildPayload(sessionId, 'heartbeat'));
        }
      } catch {
        // Silencioso
      }
    }, HEARTBEAT_INTERVAL_MS);

    // 3. Encerramento via sendBeacon em pagehide e quando a aba for ocultada
    window.addEventListener('pagehide', () => {
      sendEndBeacon(sessionId);
    });

    document.addEventListener('visibilitychange', () => {
      try {
        if (document.visibilityState === 'hidden') {
          sendEndBeacon(sessionId);
        }
      } catch {
        // Silencioso
      }
    });
  } catch {
    // Silencioso
  }
}
