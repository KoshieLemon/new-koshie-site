(() => {
  async function fetchFooter() {
    const r = await fetch('/footer.html', { cache: 'no-cache' });
    return r.text();
  }

  function attachModalOnce() {
    if (document.getElementById('legal-modal')) return;
    const m = document.createElement('div');
    m.id = 'legal-modal';
    m.style.cssText = 'position:fixed;inset:0;display:none;z-index:99999;background:rgba(8,11,17,.72);backdrop-filter:blur(2px)';
    m.innerHTML = `
      <div style="position:absolute;left:50%;top:5vh;transform:translateX(-50%);
                  width:min(1000px,92vw);height:90vh;background:#0b0f14;border:1px solid #1f2532;
                  border-radius:12px;box-shadow:0 20px 60px #000a;display:flex;flex-direction:column">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border-bottom:1px solid #1f2532">
          <strong style="color:#e5e7eb;font:600 14px/1 system-ui,Segoe UI,Roboto,Arial,sans-serif">Legal</strong>
          <button id="legal-close" title="Close"
            style="width:32px;height:32px;border-radius:8px;border:1px solid #334155;background:#0f172a;color:#e5e7eb;cursor:pointer">✕</button>
        </div>
        <iframe id="legal-frame" title="Legal document" src="about:blank" style="flex:1;border:0;background:#0b0f14"></iframe>
      </div>`;
    document.body.appendChild(m);

    const frame = m.querySelector('#legal-frame');
    const closeBtn = m.querySelector('#legal-close');

    function open(url) {
      frame.src = url;
      m.style.display = 'block';
      document.documentElement.style.overflow = 'hidden';
      closeBtn.focus();
    }
    function close() {
      m.style.display = 'none';
      document.documentElement.style.overflow = '';
      frame.src = 'about:blank';
    }
    closeBtn.addEventListener('click', close);
    m.addEventListener('click', (e) => { if (e.target === m) close(); });
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && m.style.display === 'block') close(); });

    window.openLegalModal = open;
  }

  function bindLegalLinks(rootLike) {
    rootLike.addEventListener('click', (e) => {
      const path = e.composedPath ? e.composedPath() : [];
      const a = path.find((n) => n && n.tagName === 'A' && n.getAttribute && n.getAttribute('href'));
      const href = a && a.getAttribute('href');
      if (!href) return;
      if (href.startsWith('/legal/')) {
        e.preventDefault();
        attachModalOnce();
        window.openLegalModal(href);
      }
    });
  }

  async function mountFooter() {
    const html = await fetchFooter();
    const host = document.createElement('div');
    host.id = 'kadie-footer-host';
    host.style.display = 'block';
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;
    bindLegalLinks(shadow);              // intercept clicks inside footer
  }

  // Also catch any other /legal/* links clicked on the page
  bindLegalLinks(document);

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountFooter);
  else mountFooter();
})();
