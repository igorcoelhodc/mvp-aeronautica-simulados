// navbar.js — Navbar padronizada, baseada na sessão e responsiva para todas as páginas

import { apiRequest, clearToken, getToken } from './api.js';

let beforeNavigateGuard = null;
let activeScrollHandler = null;

/**
 * Permite que páginas como simulado.html registrem uma confirmação antes de sair.
 * O callback deve retornar true para permitir a navegação ou false para cancelar.
 */
export function setBeforeNavigateGuard(fn) {
  beforeNavigateGuard = typeof fn === 'function' ? fn : null;
}

function detectActivePage(mountEl) {
  const fromAttr = mountEl?.dataset?.page?.trim();
  if (fromAttr) return fromAttr;

  const path = window.location.pathname.toLowerCase();
  if (path.endsWith('/login.html')) return 'login';
  if (path.endsWith('/dashboard.html')) return 'dashboard';
  if (path.endsWith('/simulado.html')) return 'simulado';
  if (path.endsWith('/admin.html')) return 'admin';
  return 'index';
}

function guardAction(callback) {
  if (beforeNavigateGuard && !beforeNavigateGuard()) {
    return false;
  }
  callback();
  return true;
}

function createBrandLink() {
  const link = document.createElement('a');
  link.href = './index.html';
  link.className = 'flex items-center gap-2 group';

  const iconBox = document.createElement('div');
  iconBox.className =
    'w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center transform group-hover:rotate-12 transition-transform';

  const icon = document.createElement('i');
  icon.className = 'ph-bold ph-airplane-tilt text-2xl';
  iconBox.appendChild(icon);

  const label = document.createElement('span');
  label.className = 'font-poppins font-bold text-xl text-carbon tracking-tight';
  label.append(document.createTextNode('Aeronáutica'));

  const accentWord = document.createElement('span');
  accentWord.className = 'text-primary';
  accentWord.textContent = 'Simulados';
  label.appendChild(accentWord);

  link.append(iconBox, label);

  link.addEventListener('click', (event) => {
    if (beforeNavigateGuard && !beforeNavigateGuard()) {
      event.preventDefault();
    }
  });

  return link;
}

function createNavLink(href, labelText, iconClass, isActive, isMobile = false) {
  const link = document.createElement('a');
  link.href = href;

  if (isMobile) {
    link.className = isActive
      ? 'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-primary/12 text-primary font-poppins font-semibold text-base'
      : 'flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-carbon font-medium text-base hover:bg-primary/10 hover:text-primary transition-colors';
  } else {
    link.className = isActive ? 'nav-link nav-link-active' : 'nav-link';
  }

  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = `${iconClass} text-lg`;
    link.appendChild(icon);
  }
  link.appendChild(document.createTextNode(labelText));

  link.addEventListener('click', (event) => {
    if (beforeNavigateGuard && !beforeNavigateGuard()) {
      event.preventDefault();
    }
  });

  return link;
}

function buildNavbarDOM(mountEl, activePage, usuario) {
  const isAuthenticated = Boolean(usuario);
  const isAdmin = usuario?.perfil === 'ADMIN';
  const isLanding = activePage === 'index';

  const nav = document.createElement('nav');
  nav.id = 'navbar';
  nav.className = isLanding
    ? 'fixed top-0 left-0 w-full z-50 transition-all duration-300 py-4'
    : 'fixed top-0 left-0 w-full z-50 transition-all duration-300 py-3 glass shadow-sm';

  const inner = document.createElement('div');
  inner.className = 'max-w-7xl mx-auto px-6 flex justify-between items-center gap-4';

  const brand = createBrandLink();

  // Links centrais (Desktop)
  const desktopLinks = document.createElement('div');
  desktopLinks.className = 'hidden md:flex items-center gap-2';

  desktopLinks.appendChild(
    createNavLink('./index.html', 'Início', 'ph-bold ph-house', activePage === 'index', false)
  );

  if (isLanding && !isAuthenticated) {
    const recLink = createNavLink('#recursos', 'Recursos', '', false, false);
    desktopLinks.appendChild(recLink);
  }

  if (isAuthenticated) {
    desktopLinks.appendChild(
      createNavLink(
        './dashboard.html',
        'Dashboard',
        'ph-bold ph-gauge',
        activePage === 'dashboard' || activePage === 'simulado',
        false
      )
    );
  }

  if (isAdmin) {
    desktopLinks.appendChild(
      createNavLink('./admin.html', 'Painel Admin', 'ph-bold ph-shield-check', activePage === 'admin', false)
    );
  }

  // Ações à direita (Desktop)
  const desktopActions = document.createElement('div');
  desktopActions.className = 'hidden md:flex items-center gap-3';

  const handleLogout = () => {
    guardAction(() => {
      clearToken();
      window.location.href = './login.html';
    });
  };

  if (isAuthenticated) {
    const userChip = document.createElement('span');
    userChip.className =
      'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-dark text-xs font-semibold text-carbon max-w-[200px]';

    const userIcon = document.createElement('i');
    userIcon.className = isAdmin
      ? 'ph-fill ph-shield-check text-primary text-base shrink-0'
      : 'ph-fill ph-user-circle text-primary text-base shrink-0';

    const userName = document.createElement('span');
    userName.className = 'truncate';
    userName.textContent = usuario.nome;

    userChip.append(userIcon, userName);

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className =
      'glass px-4 py-2 rounded-full font-poppins font-semibold text-sm text-carbon hover:text-accent hover:border-accent/40 transition-all inline-flex items-center gap-1.5';
    const outIcon = document.createElement('i');
    outIcon.className = 'ph-bold ph-sign-out';
    logoutBtn.append(outIcon, document.createTextNode('Sair'));
    logoutBtn.addEventListener('click', handleLogout);

    desktopActions.append(userChip, logoutBtn);
  } else {
    const authBtn = document.createElement('a');
    authBtn.href = './login.html';
    authBtn.className =
      activePage === 'login'
        ? 'bg-primary text-white px-5 py-2.5 rounded-full font-poppins font-semibold text-sm shadow-md shadow-primary/30 transition-all inline-flex items-center gap-1.5'
        : 'bg-accent text-white px-6 py-2.5 rounded-full font-poppins font-semibold text-sm shadow-lg shadow-accent/30 hover:shadow-glow hover:-translate-y-0.5 transition-all inline-flex items-center gap-1.5';
    const loginIcon = document.createElement('i');
    loginIcon.className = 'ph-bold ph-sign-in text-base';
    authBtn.append(loginIcon, document.createTextNode('Entrar / Cadastrar'));
    desktopActions.appendChild(authBtn);
  }

  // Botão hambúrguer (Mobile)
  const mobileBtn = document.createElement('button');
  mobileBtn.id = 'mobile-menu-btn';
  mobileBtn.type = 'button';
  mobileBtn.setAttribute('aria-label', 'Abrir menu de navegação');
  mobileBtn.setAttribute('aria-expanded', 'false');
  mobileBtn.className = 'md:hidden text-carbon text-3xl focus:outline-none p-1';
  const menuIcon = document.createElement('i');
  menuIcon.className = 'ph ph-list';
  mobileBtn.appendChild(menuIcon);

  inner.append(brand, desktopLinks, desktopActions, mobileBtn);

  // Drawer Mobile
  const mobileMenu = document.createElement('div');
  mobileMenu.id = 'mobile-menu';
  mobileMenu.className =
    'hidden absolute top-full left-0 w-full glass flex-col px-6 py-4 gap-2 md:hidden shadow-glass border-t border-white/30';

  mobileMenu.appendChild(
    createNavLink('./index.html', 'Início', 'ph-bold ph-house', activePage === 'index', true)
  );

  if (isLanding && !isAuthenticated) {
    mobileMenu.appendChild(createNavLink('#recursos', 'Recursos', 'ph-bold ph-sparkle', false, true));
  }

  if (isAuthenticated) {
    mobileMenu.appendChild(
      createNavLink(
        './dashboard.html',
        'Dashboard',
        'ph-bold ph-gauge',
        activePage === 'dashboard' || activePage === 'simulado',
        true
      )
    );
  }

  if (isAdmin) {
    mobileMenu.appendChild(
      createNavLink('./admin.html', 'Painel Admin', 'ph-bold ph-shield-check', activePage === 'admin', true)
    );
  }

  if (isAuthenticated) {
    const mobileUserRow = document.createElement('div');
    mobileUserRow.className =
      'mt-2 pt-3 border-t border-carbon/10 flex items-center justify-between gap-3';

    const mobileUserLabel = document.createElement('span');
    mobileUserLabel.className = 'text-sm font-medium text-carbon/80 truncate flex items-center gap-2';
    const uIcon = document.createElement('i');
    uIcon.className = isAdmin
      ? 'ph-fill ph-shield-check text-primary text-lg shrink-0'
      : 'ph-fill ph-user-circle text-primary text-lg shrink-0';
    mobileUserLabel.append(uIcon, document.createTextNode(usuario.nome));

    const mobileLogoutBtn = document.createElement('button');
    mobileLogoutBtn.type = 'button';
    mobileLogoutBtn.className =
      'bg-accent text-white px-4 py-2 rounded-xl font-poppins font-semibold text-sm shrink-0';
    mobileLogoutBtn.textContent = 'Sair';
    mobileLogoutBtn.addEventListener('click', handleLogout);

    mobileUserRow.append(mobileUserLabel, mobileLogoutBtn);
    mobileMenu.appendChild(mobileUserRow);
  } else {
    const mobileAuthLink = document.createElement('a');
    mobileAuthLink.href = './login.html';
    mobileAuthLink.className =
      'bg-accent text-white text-center px-6 py-3 rounded-xl font-poppins font-semibold w-full mt-2';
    mobileAuthLink.textContent = 'Entrar / Cadastrar';
    mobileMenu.appendChild(mobileAuthLink);
  }

  const closeMobileMenu = () => {
    mobileMenu.classList.add('hidden');
    mobileMenu.classList.remove('flex');
    menuIcon.classList.remove('ph-x');
    menuIcon.classList.add('ph-list');
    mobileBtn.setAttribute('aria-expanded', 'false');
  };

  mobileBtn.addEventListener('click', () => {
    const isHidden = mobileMenu.classList.toggle('hidden');
    mobileMenu.classList.toggle('flex', !isHidden);
    menuIcon.classList.toggle('ph-list', isHidden);
    menuIcon.classList.toggle('ph-x', !isHidden);
    mobileBtn.setAttribute('aria-expanded', String(!isHidden));
  });

  mobileMenu.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', closeMobileMenu);
  });

  nav.append(inner, mobileMenu);
  mountEl.replaceChildren(nav);

  // Efeito suave de scroll na landing page (sem acumular listeners)
  if (activeScrollHandler) {
    window.removeEventListener('scroll', activeScrollHandler);
    activeScrollHandler = null;
  }

  if (isLanding) {
    activeScrollHandler = () => {
      if (window.scrollY > 20) {
        nav.classList.add('glass', 'shadow-sm', 'py-2');
        nav.classList.remove('py-4');
      } else {
        nav.classList.remove('glass', 'shadow-sm', 'py-2');
        nav.classList.add('py-4');
      }
    };
    window.addEventListener('scroll', activeScrollHandler, { passive: true });
    activeScrollHandler();
  }
}

export async function initNavbar() {
  const mountEl = document.getElementById('app-navbar');
  if (!mountEl) return;

  const activePage = detectActivePage(mountEl);

  // Renderização imediata como Visitante para evitar layout shift
  buildNavbarDOM(mountEl, activePage, null);

  // Só chama /api/auth/me se houver token salvo
  const token = getToken();
  if (!token) {
    return;
  }

  try {
    const data = await apiRequest('/auth/me', { method: 'GET' });
    if (data?.usuario) {
      buildNavbarDOM(mountEl, activePage, data.usuario);
    } else {
      clearToken();
      buildNavbarDOM(mountEl, activePage, null);
    }
  } catch {
    // Em páginas públicas (ou token expirado 401), limpa o token e mantém estado Visitante sem redirecionar
    clearToken();
    buildNavbarDOM(mountEl, activePage, null);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
});
