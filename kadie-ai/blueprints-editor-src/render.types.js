// Shared types, colors, shapes, and CSS for node UI.
export const TYPE_EQUIV = { /* unchanged */ };
export const TYPE_COLORS = { /* unchanged */ };

export function colorKeyFor(type) {
  if (!type) return 'string';
  const t = String(type);
  if (TYPE_EQUIV[t]) return TYPE_EQUIV[t];
  if (t.endsWith('Id')) return 'snowflake';
  return TYPE_EQUIV[t] || t;
}
export function cssToken(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g, '-'); }

export function ensureTypeStylesInjected(){
  if (document.getElementById('node-renderer-styles')) return;
  const style = document.createElement('style'); style.id = 'node-renderer-styles';
  let css = `
  .node{position:absolute;background:#0b1020;border:1px solid #1f2937;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.35)}
  .node .header{display:flex;align-items:center;justify-content:flex-start;padding:8px 10px;color:#e5e7eb;background:#0a0f1a;border-bottom:1px solid #1f2937;border-top-left-radius:12px;border-top-right-radius:12px}
  .node .header .title{font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}

  /* two-column by default; compact gaps */
  .node .pins{display:grid;grid-template-columns:1fr 1fr;gap:8px 18px;padding:8px 10px 8px 8px}
  /* one-column when no inputs (events) */
  .node.no-inputs .pins{grid-template-columns:1fr;gap:8px 10px;padding-right:10px;padding-left:8px}
  .node.no-inputs .side.outputs{align-items:flex-start}

  .side.inputs{display:flex;flex-direction:column;align-items:flex-start}
  .side.outputs{display:flex;flex-direction:column;align-items:flex-end}

  .pin.left{display:flex;align-items:center;justify-content:flex-start;min-height:18px}
  .pin.left .jack{order:0;margin-right:6px}
  .pin.left .label{order:1;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .pin.right{display:grid;grid-template-columns:max-content auto;align-items:center;width:100%}
  .pin.right .label{grid-column:1;justify-self:end;text-align:right;margin:0 6px 0 0;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .pin.right .jack{grid-column:2;justify-self:end;margin:0}

  .pin .jack{width:14px;height:14px;box-sizing:border-box;display:inline-block;position:relative}
  .pin.data{color:#9ca3af}
  .pin.data .jack{border-radius:50%;border:2px solid currentColor;background:transparent}
  .pin.data .label{color:currentColor}
  .pin.exec .jack{border:none;background:transparent}
  .pin.exec .label{color:#ffffff}
  .pin.left.exec .jack::after,.pin.right.exec .jack::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent}
  .pin.left.exec .jack::after{border-right:10px solid #ffffff;margin-left:-2px}
  .pin.right.exec .jack::after{border-left:10px solid #ffffff;margin-left:2px}

  /* literals: start as a square; expand on focus/input */
  .pin .literal-wrap{display:inline-flex;align-items:center;margin-left:6px}
  .pin .literal{
    border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;
    padding:0; min-width:18px; min-height:18px; width:18px; height:18px;
    font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif; overflow:hidden;
  }
  .pin .literal:focus{outline:none}
  .pin .literal.expanded{min-width:64px;width:120px;height:auto;padding:2px 6px;white-space:pre-wrap}
  .pin input[type="checkbox"].pin-input{width:14px;height:14px}

  svg#wires path.wire{stroke:var(--wire, #64748b);stroke-width:2;fill:none;opacity:.95}
  `;
  for (const [key, hex] of Object.entries(TYPE_COLORS)){
    const cls = cssToken(key);
    css += `
    .pin.data.t-${cls}{ color:${hex}; }
    .pin.data.t-${cls} .literal{ border-color:${hex}33; box-shadow:0 0 0 1px ${hex}22 inset; }
    `;
  }
  style.textContent = css; document.head.appendChild(style);
}

export const DISCORD_SHAPES = { /* unchanged */ };
export function toFinalPrimitive(t){ return TYPE_EQUIV[t] || t || 'string'; }
