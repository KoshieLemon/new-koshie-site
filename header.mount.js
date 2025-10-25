(() => {
  async function fetchHeader() {
    const r = await fetch('/header.html', { cache: 'no-cache' });
    return r.text();
  }

  function pickFirstString(list) {
    for (const v of list) {
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
    return '';
  }

  function readHeaderContent() {
    const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content;
    const ds = (k) => document.body?.dataset?.[k];

    const cfg = (typeof window.KADIE_HEADER === 'object' && window.KADIE_HEADER) || {};

    const title = pickFirstString([
      cfg.title,
      meta('kadie-header-title'),
      meta('header:title'),
      ds('kadieHeaderTitle'),
      ds('headerTitle'),
      document.title
    ]);

    const desc = pickFirstString([
      cfg.desc,
      cfg.description,           // alias supported
      meta('kadie-header-desc'),
      meta('header:desc'),
      ds('kadieHeaderDesc'),
      ds('headerDesc')
    ]);

    return { title, desc };
  }

  async function mountHeader() {
    if (document.getElementById('kadie-header-host')) return;

    const html = await fetchHeader();

    const host = document.createElement('div');
    host.id = 'kadie-header-host';
    host.style.display = 'block';
    document.body.insertBefore(host, document.body.firstChild);

    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = html;

    const apply = ({ title, desc }) => {
      const t = shadow.getElementById('kh-title');
      const d = shadow.getElementById('kh-desc');
      if (t && typeof title === 'string') t.textContent = title;
      if (d) {
        const has = typeof desc === 'string' && desc.trim() !== '';
        d.textContent = has ? desc : '';
        d.style.display = has ? '' : 'none';
      }
    };

    apply(readHeaderContent());

    // Runtime updater
    window.setKadieHeader = function (next) {
      if (!next) return;
      const cur = readHeaderContent();
      const title = next.title != null ? String(next.title) : cur.title;
      const desc =
        next.desc != null
          ? String(next.desc)
          : next.description != null
          ? String(next.description)
          : cur.desc ?? cur.description ?? '';
      const host = document.getElementById('kadie-header-host');
      if (!host?.shadowRoot) return;
      const t = host.shadowRoot.getElementById('kh-title');
      const d = host.shadowRoot.getElementById('kh-desc');
      if (t) t.textContent = title;
      if (d) {
        const has = desc.trim() !== '';
        d.textContent = has ? desc : '';
        d.style.display = has ? '' : 'none';
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountHeader);
  } else {
    mountHeader();
  }
})();
