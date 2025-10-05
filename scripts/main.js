(function(){
  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('primary-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.getAttribute('data-open') === 'true';
      nav.setAttribute('data-open', String(!open));
      toggle.setAttribute('aria-expanded', String(!open));
    });
  }

  // Respect reduces-motion
  const prefersReduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReduce) {
    // Simple fade-in
    document.addEventListener('DOMContentLoaded', () => {
      document.body.style.opacity = '0';
      document.body.style.transition = 'opacity .35s ease';
      requestAnimationFrame(() => { document.body.style.opacity = '1'; });
    });
  }
})();
