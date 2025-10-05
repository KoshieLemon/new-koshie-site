(function(){
  const y = document.getElementById('ka-year');
  if (y) y.textContent = String(new Date().getFullYear());

  // Smooth scroll without external deps
  const links = document.querySelectorAll('a[href^="#"]');
  links.forEach(a => {
    a.addEventListener('click', e => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      history.pushState(null, '', id);
    });
  });
})();
