// navbar.js — Menu mobile e efeito de scroll na barra de navegação

document.addEventListener('DOMContentLoaded', () => {
  const navbar = document.getElementById('navbar');
  const mobileBtn = document.getElementById('mobile-menu-btn');
  const mobileMenu = document.getElementById('mobile-menu');

  if (navbar) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 20) {
        navbar.classList.add('glass', 'shadow-sm', 'py-2');
        navbar.classList.remove('py-4');
      } else {
        navbar.classList.remove('glass', 'shadow-sm', 'py-2');
        navbar.classList.add('py-4');
      }
    });
  }

  if (mobileBtn && mobileMenu) {
    mobileBtn.addEventListener('click', () => {
      mobileMenu.classList.toggle('hidden');
      mobileMenu.classList.toggle('flex');

      const icon = mobileBtn.querySelector('i');
      if (icon) {
        if (mobileMenu.classList.contains('hidden')) {
          icon.classList.remove('ph-x');
          icon.classList.add('ph-list');
        } else {
          icon.classList.remove('ph-list');
          icon.classList.add('ph-x');
        }
      }
    });

    const mobileLinks = mobileMenu.querySelectorAll('a');
    mobileLinks.forEach((link) => {
      link.addEventListener('click', () => {
        mobileMenu.classList.add('hidden');
        mobileMenu.classList.remove('flex');
        const icon = mobileBtn.querySelector('i');
        if (icon) {
          icon.classList.remove('ph-x');
          icon.classList.add('ph-list');
        }
      });
    });
  }
});
