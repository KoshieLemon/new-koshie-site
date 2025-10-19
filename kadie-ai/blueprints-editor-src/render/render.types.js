// Shared types, colors, shapes, and CSS for node UI.

function isArrayType(t){ return /^array<.+>$/.test(String(t||'')); }
function isMapType(t){ return /^map<\s*[^,>]+\s*,\s*[^>]+>$/.test(String(t||'')); }
function baseOf(t){
  const s = String(t||'');
  if (isArrayType(s)) return 'array';
  if (isMapType(s))   return 'map';
  return null;
}

export const TYPE_EQUIV = {
  any:'json',
  boolean:'boolean', string:'string',
  int:'number', float:'number', number:'number', bigint:'bigint',
  json:'json', buffer:'buffer', stream:'stream', date:'date',
  timestamp_ms:'timestamp_ms', duration_ms:'duration_ms',
  url:'url', color:'color', char:'string',

  Client:'Client', Guild:'Guild', User:'User', GuildMember:'GuildMember', Role:'Role',
  Message:'Message', Attachment:'Attachment', Webhook:'Webhook', Invite:'Invite',

  Channel:'Channel',
  TextBasedChannel:'TextBasedChannel', VoiceBasedChannel:'VoiceBasedChannel', CategoryChannel:'CategoryChannel',
  TextChannel:'TextBasedChannel', ThreadChannel:'TextBasedChannel', DMChannel:'TextBasedChannel',
  NewsChannel:'TextBasedChannel', ForumChannel:'TextBasedChannel',
  VoiceChannel:'VoiceBasedChannel', StageChannel:'VoiceBasedChannel',

  Interaction:'Interaction',
  ChatInputCommandInteraction:'Interaction',
  MessageComponentInteraction:'Interaction',
  ModalSubmitInteraction:'Interaction',
  AutocompleteInteraction:'Interaction',

  PermissionName:'PermissionName',
  PermissionState:'PermissionState',
  PermissionsEntry:'PermissionsEntry',

  Permissions:'Permissions',
  UserPermissions:'UserPermissions',
  PermissionClient:'PermissionClient',

  Slowmode:'Slowmode',
  HideAfterInactivity:'HideAfterInactivity'
};

export const TYPE_COLORS = {
  boolean:'#10b981', string:'#3b82f6', number:'#f59e0b', bigint:'#a855f7', json:'#14b8a6',
  buffer:'#6b7280', stream:'#6366f1', date:'#ec4899', timestamp_ms:'#ef4444', duration_ms:'#f97316',
  url:'#0ea5e9', color:'#84cc16',

  Client:'#0ea5e9', Guild:'#22c55e', User:'#f472b6', GuildMember:'#2dd4bf', Role:'#f43f5e',
  Message:'#60a5fa', Attachment:'#94a3b8', Webhook:'#8b5cf6', Invite:'#fde047',

  Channel:'#16a34a',
  TextBasedChannel:'#38bdf8', VoiceBasedChannel:'#06b6d4', CategoryChannel:'#a3e635',
  Interaction:'#fb7185',

  PermissionName:'#a855f7',
  PermissionState:'#f59e0b',
  PermissionsEntry:'#8b5cf6',

  Permissions:'#8b5cf6',
  UserPermissions:'#0ea5e9',
  PermissionClient:'#22d3ee',

  array:'#94a3b8',
  map:'#06b6d4'
};

export function colorKeyFor(type){
  if (!type) return 'string';
  const base = baseOf(type);
  if (base) return base;
  const t = String(type);
  if (TYPE_EQUIV[t]) return TYPE_EQUIV[t];
  if (t.endsWith('Id')) return 'string';
  return t;
}
export function cssToken(s){ return String(s).replace(/[^a-zA-Z0-9_-]/g,'-'); }

export function ensureTypeStylesInjected(){
  if (document.getElementById('node-renderer-styles')) return;
  const style = document.createElement('style'); style.id = 'node-renderer-styles';
  let css = `
  .node{position:absolute;background:#0b1020;border:1px solid #1f2937;border-radius:12px;box-shadow:0 4px 16px #0008}
  .node .header{display:flex;align-items:center;justify-content:flex-start;padding:8px 10px;color:#e5e7eb;background:#0a0f1a;border-bottom:1px solid #1f2937;border-top-left-radius:12px;border-top-right-radius:12px}
  .node .header .title{flex:1}
  .node .header .icon-btn{margin-left:auto;background:#111827;border:1px solid #374151;color:#e5e7eb;border-radius:6px;width:22px;height:22px;line-height:20px;text-align:center;padding:0;cursor:pointer}
  .node .header .icon-btn:hover{background:#1f2937}
  .node .pins{display:grid;grid-template-columns:auto auto;gap:8px 18px;padding:8px 10px}
  .node.outputs-only .pins{grid-template-columns:1fr;padding:8px 10px}
  .node.outputs-only .pins .side.outputs{justify-self:end;width:max-content}
  .side.inputs{display:flex;flex-direction:column;align-items:flex-start}
  .side.outputs{display:flex;flex-direction:column;align-items:flex-end}
  .pin{min-height:18px}
  .pin.left{display:flex;align-items:center}
  .pin.left .jack{margin-right:6px}
  .pin.left .label{font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .pin.right{display:grid;grid-template-columns:max-content 14px;align-items:center}
  .pin.right .label{text-align:right;justify-self:end;margin-right:6px;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .pin .jack{width:14px;height:14px;position:relative}
  .pin.data{color:#9ca3af}
  .pin.data .jack{border-radius:50%;border:2px solid currentColor;background:transparent}
  .pin.exec .jack{background:transparent;border:none}
  .pin.left.exec .jack::after,.pin.right.exec .jack::after{content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent}
  .pin.left.exec .jack::after{border-right:10px solid #ffffff;margin-left:-2px}
  .pin.right.exec .jack::after{border-left:10px solid #ffffff;margin-left:2px}
  .pin .literal-wrap{display:inline-flex;align-items:center;margin-left:6px}
  .pin .literal{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:2px 6px;min-width:18px;max-width:240px;resize:none;overflow:hidden}
  .pin textarea.literal{line-height:1.2;min-height:18px}
  svg#wires path.wire{stroke:var(--wire, #64748b);stroke-width:2;fill:none;opacity:.95}

  .pin.data.t-array .jack::after{
    content:'[]';position:absolute;left:50%;top:50%;transform:translate(-50%,-55%);
    font:600 8px/1 system-ui;color:currentColor
  }
  .pin.data.t-map .jack::after{
    content:'{}';position:absolute;left:50%;top:50%;transform:translate(-50%,-55%);
    font:700 8px/1 system-ui;color:currentColor
  }
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

export const DISCORD_SHAPES = {
  Client:'hex', Guild:'hex', User:'circle', GuildMember:'circle', Role:'diamond',
  Message:'rect', Attachment:'rect', Webhook:'diamond', Invite:'diamond',
  Channel:'rounded',
  TextBasedChannel:'rounded', VoiceBasedChannel:'rounded', CategoryChannel:'folder',
  Interaction:'hex',
  Slowmode:'badge',
  HideAfterInactivity:'badge'
};

// keep generics so ForEach(Map) can infer K,V
export function toFinalPrimitive(t){
  const base = baseOf(t);
  if (!base){
    const k = TYPE_EQUIV[t] || t || 'string';
    return (k === 'int' || k === 'float') ? 'number' : k;
  }
  return String(t);
}

if (typeof window !== 'undefined') window.DISCORD_SHAPES = DISCORD_SHAPES;

// Enum values for UI dropdowns
if (typeof window !== 'undefined'){
  window.ENUMS = window.ENUMS || {};
  if (!Array.isArray(window.ENUMS.Slowmode)){
    window.ENUMS.Slowmode = ['Off','5s','10s','15s','30s','1m','2m','5m','10m'];
  }
  if (!Array.isArray(window.ENUMS.HideAfterInactivity)){
    window.ENUMS.HideAfterInactivity = ['1h','24h','3d','7d'];
  }
}
