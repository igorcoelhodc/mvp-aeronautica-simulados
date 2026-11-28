// footer.js — Rodapé padronizado compartilhado entre todas as páginas (DOM seguro)

function createFooterLink(href, labelText, iconClass = '') {
  const li = document.createElement('li');
  const a = document.createElement('a');
  a.href = href;
  a.className = iconClass
    ? 'hover:text-primary transition-colors flex items-center gap-2'
    : 'hover:text-primary transition-colors';

  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = iconClass;
    a.appendChild(icon);
  }
  a.appendChild(document.createTextNode(labelText));
  li.appendChild(a);
  return li;
}

export function initFooter() {
  const mountEl = document.getElementById('app-footer');
  if (!mountEl) return;

  mountEl.className = 'w-full bg-carbon pt-16 pb-8 border-t border-white/10 relative z-20 mt-auto';

  const container = document.createElement('div');
  container.className = 'max-w-7xl mx-auto px-6';

  // Grid principal (4 colunas em md+)
  const grid = document.createElement('div');
  grid.className = 'grid md:grid-cols-4 gap-8 mb-12';

  // Coluna 1-2: Marca e descrição
  const brandCol = document.createElement('div');
  brandCol.className = 'md:col-span-2';

  const brandLink = document.createElement('a');
  brandLink.href = './index.html';
  brandLink.className = 'flex items-center gap-2 mb-4';

  const planeIcon = document.createElement('i');
  planeIcon.className = 'ph-fill ph-airplane-tilt text-3xl text-primary';

  const brandName = document.createElement('span');
  brandName.className = 'font-poppins font-bold text-2xl text-white tracking-tight';
  brandName.append(document.createTextNode('Aeronáutica'));

  const brandHighlight = document.createElement('span');
  brandHighlight.className = 'text-primary';
  brandHighlight.textContent = 'Simulados';
  brandName.appendChild(brandHighlight);

  brandLink.append(planeIcon, brandName);

  const desc = document.createElement('p');
  desc.className = 'text-white/60 text-sm max-w-sm';
  desc.textContent =
    'A plataforma de ensino e simulados aeronáuticos feita para a nova geração da aviação. Moderna, leve e precisa.';

  brandCol.append(brandLink, desc);

  // Coluna 3: Plataforma
  const platCol = document.createElement('div');
  const platTitle = document.createElement('h4');
  platTitle.className = 'font-poppins font-semibold text-white mb-4';
  platTitle.textContent = 'Plataforma';

  const platList = document.createElement('ul');
  platList.className = 'space-y-2 text-white/60 text-sm';
  platList.append(
    createFooterLink('./index.html', 'Página Inicial'),
    createFooterLink('./dashboard.html', 'Simulados ANAC'),
    createFooterLink('./login.html', 'Entrar / Cadastrar')
  );
  platCol.append(platTitle, platList);

  // Coluna 4: Contato
  const contactCol = document.createElement('div');
  const contactTitle = document.createElement('h4');
  contactTitle.className = 'font-poppins font-semibold text-white mb-4';
  contactTitle.textContent = 'Contato';

  const contactList = document.createElement('ul');
  contactList.className = 'space-y-2 text-white/60 text-sm';
  contactList.append(
    createFooterLink('mailto:ola@aeronauticasimulados.com.br', 'ola@aeronauticasimulados.com.br', 'ph ph-envelope'),
    createFooterLink('#', '@aeronauticasimulados', 'ph ph-instagram-logo')
  );
  contactCol.append(contactTitle, contactList);

  grid.append(brandCol, platCol, contactCol);

  // Barra inferior
  const bottomBar = document.createElement('div');
  bottomBar.className =
    'border-t border-white/10 pt-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-white/40';

  const copy = document.createElement('p');
  copy.textContent = '© 2026 Aeronáutica Simulados. Feito com ❤️ em Goiânia, no coração do Brasil.';

  const legal = document.createElement('div');
  legal.className = 'flex gap-4';

  const termos = document.createElement('a');
  termos.href = '#';
  termos.className = 'hover:text-white transition-colors';
  termos.textContent = 'Termos de Uso';

  const privacidade = document.createElement('a');
  privacidade.href = '#';
  privacidade.className = 'hover:text-white transition-colors';
  privacidade.textContent = 'Política de Privacidade';

  legal.append(termos, privacidade);
  bottomBar.append(copy, legal);

  container.append(grid, bottomBar);
  mountEl.replaceChildren(container);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initFooter);
} else {
  initFooter();
}
