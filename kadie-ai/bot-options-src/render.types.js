// Shared types, colors, shapes, and CSS for node UI.

export const TYPE_EQUIV = {
  boolean:'boolean', string:'string', int:'number', float:'number', number:'number', bigint:'bigint',
  json:'json', buffer:'buffer', stream:'stream', date:'date', timestamp_ms:'timestamp_ms',
  duration_ms:'duration_ms', url:'url', color:'color',

  snowflake:'snowflake',
  guildId:'snowflake', channelId:'snowflake', userId:'snowflake', memberId:'snowflake',
  roleId:'snowflake', messageId:'snowflake', emojiId:'snowflake', webhookId:'snowflake',
  applicationId:'snowflake', interactionId:'snowflake',

  Client:'Client', Guild:'Guild', User:'User', GuildMember:'GuildMember', Role:'Role',
  Message:'Message', Attachment:'Attachment', Webhook:'Webhook', Invite:'Invite',

  TextBasedChannel:'TextBasedChannel', TextChannel:'TextBasedChannel', ThreadChannel:'TextBasedChannel',
  DMChannel:'TextBasedChannel', NewsChannel:'TextBasedChannel', ForumChannel:'TextBasedChannel',

  VoiceBasedChannel:'VoiceBasedChannel', VoiceChannel:'VoiceBasedChannel', StageChannel:'VoiceBasedChannel',
  CategoryChannel:'CategoryChannel',

  Interaction:'Interaction', ChatInputCommandInteraction:'Interaction',
  MessageComponentInteraction:'Interaction', ModalSubmitInteraction:'Interaction',
  AutocompleteInteraction:'Interaction',

  MessageContent:'string', Embed:'Embed', ComponentRow:'ComponentRow',
  AllowedMentions:'AllowedMentions', MessageReference:'MessageReference',
  AttachmentInput:'AttachmentInput', TTS:'boolean',

  Permissions:'Permissions', IntentFlags:'IntentFlags',
};

export const TYPE_COLORS = {
  boolean:'#10b981', string:'#3b82f6', number:'#f59e0b', bigint:'#a855f7', json:'#14b8a6',
  buffer:'#6b7280', stream:'#6366f1', date:'#ec4899', timestamp_ms:'#ef4444', duration_ms:'#f97316',
  url:'#0ea5e9', color:'#84cc16', snowflake:'#22d3ee',

  Client:'#0ea5e9', Guild:'#22c55e', User:'#f472b6', GuildMember:'#2dd4bf', Role:'#f43f5e',
  Message:'#60a5fa', Attachment:'#94a3b8', Webhook:'#8b5cf6', Invite:'#fde047',

  TextBasedChannel:'#38bdf8', VoiceBasedChannel:'#06b6d4', CategoryChannel:'#a3e635',
  Interaction:'#fb7185',

  Embed:'#eab308', ComponentRow:'#f97316', AllowedMentions:'#4ade80',
  MessageReference:'#facc15', AttachmentInput:'#64748b',

  Permissions:'#a855f7', IntentFlags:'#a78bfa',
};

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
  const style = document.createElement('style');
  style.id = 'node-renderer-styles';

  let css = `
  .node{position:absolute;background:#0b1020;border:1px solid #1f2937;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,.35)}
  .node .header{display:flex;align-items:center;justify-content:space-between;padding:8px 10px;color:#e5e7eb;background:#0a0f1a;border-bottom:1px solid #1f2937;border-top-left-radius:12px;border-top-right-radius:12px}
  .node .header .title{font:600 12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .node .header .subtitle{opacity:.6;font:500 10px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}

  .node .pins{display:grid;grid-template-columns:1fr 1fr;gap:10px 28px;padding:10px 14px 10px 10px}
  .side.inputs{display:flex;flex-direction:column;align-items:flex-start}
  .side.outputs{display:flex;flex-direction:column;align-items:flex-end}

  .pin.left{display:flex;align-items:center;justify-content:flex-start;min-height:18px}
  .pin.left .jack{order:0;margin-right:6px}
  .pin.left .label{order:1;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}

  .pin.right{display:grid;grid-template-columns:max-content auto;align-items:center;width:100%;}
  .pin.right .label{grid-column:1;justify-self:end;text-align:right;margin:0 6px 0 0;font:12px/1.2 system-ui,Segoe UI,Roboto,Arial,sans-serif}
  .pin.right .jack{grid-column:2;justify-self:end;margin:0}

  .pin .jack{width:14px;height:14px;box-sizing:border-box;display:inline-block;position:relative}
  .pin.data{color:#9ca3af}
  .pin.data .jack{border-radius:50%;border:2px solid currentColor;background:transparent}
  .pin.data .label{color:currentColor}
  .pin.exec .jack{border:none;background:transparent}
  .pin.exec .label{color:#ffffff}
  .pin.left.exec .jack::after,
  .pin.right.exec .jack::after{
    content:'';position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:0;height:0;border-top:6px solid transparent;border-bottom:6px solid transparent;
  }
  .pin.left.exec .jack::after{border-right:10px solid #ffffff;margin-left:-2px}
  .pin.right.exec .jack::after{border-left:10px solid #ffffff;margin-left:2px}

  .pin .literal-wrap{display:inline-flex;align-items:center;margin-left:6px}
  .pin .literal{border:1px solid #374151;background:#111827;color:#e5e7eb;border-radius:6px;padding:2px 6px;min-width:120px}
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
  style.textContent = css;
  document.head.appendChild(style);
}

/** Canonical field lists for common Discord.js objects (raw types). */
export const DISCORD_SHAPES = {
  Message: [
    { name:'id',              type:'snowflake' },
    { name:'content',         type:'string' },
    { name:'authorId',        type:'snowflake' },
    { name:'channelId',       type:'snowflake' },
    { name:'guildId',         type:'snowflake' },
    { name:'createdTimestamp',type:'timestamp_ms' },
    { name:'pinned',          type:'boolean' },
    { name:'tts',             type:'boolean' },
    { name:'attachmentsCount',type:'number' },
    { name:'embedsCount',     type:'number' },
    { name:'hasThread',       type:'boolean' },
    { name:'url',             type:'url' },
    { name:'type',            type:'string' },
  ],
  User: [
    { name:'id',              type:'snowflake' },
    { name:'username',        type:'string' },
    { name:'globalName',      type:'string' },
    { name:'bot',             type:'boolean' },
    { name:'createdTimestamp',type:'timestamp_ms' },
  ],
  GuildMember: [
    { name:'userId',          type:'snowflake' },
    { name:'nickname',        type:'string' },
    { name:'joinedTimestamp', type:'timestamp_ms' },
    { name:'pending',         type:'boolean' },
    { name:'rolesCount',      type:'number' },
    { name:'guildId',         type:'snowflake' },
  ],
  Guild: [
    { name:'id',              type:'snowflake' },
    { name:'name',            type:'string' },
    { name:'memberCount',     type:'number' },
    { name:'createdTimestamp',type:'timestamp_ms' },
    { name:'ownerId',         type:'snowflake' },
  ],
  TextBasedChannel: [
    { name:'id',              type:'snowflake' },
    { name:'name',            type:'string' },
    { name:'guildId',         type:'snowflake' },
    { name:'nsfw',            type:'boolean' },
    { name:'topic',           type:'string' },
    { name:'type',            type:'string' },
    { name:'createdTimestamp',type:'timestamp_ms' },
  ],
  VoiceBasedChannel: [
    { name:'id',              type:'snowflake' },
    { name:'name',            type:'string' },
    { name:'guildId',         type:'snowflake' },
    { name:'bitrate',         type:'number' },
    { name:'userLimit',       type:'number' },
    { name:'parentId',        type:'snowflake' },
    { name:'createdTimestamp',type:'timestamp_ms' },
  ],
  Role: [
    { name:'id',              type:'snowflake' },
    { name:'name',            type:'string' },
    { name:'color',           type:'color' },
    { name:'hoist',           type:'boolean' },
    { name:'managed',         type:'boolean' },
    { name:'position',        type:'number' },
    { name:'permissions',     type:'Permissions' },
  ],
  Interaction: [
    { name:'id',              type:'snowflake' },
    { name:'userId',          type:'snowflake' },
    { name:'channelId',       type:'snowflake' },
    { name:'guildId',         type:'snowflake' },
    { name:'commandName',     type:'string' },
    { name:'customId',        type:'string' },
    { name:'createdTimestamp',type:'timestamp_ms' },
    { name:'type',            type:'string' },
  ],
  Invite: [
    { name:'code',             type:'string' },
    { name:'url',              type:'url' },
    { name:'channelId',        type:'snowflake' },
    { name:'guildId',          type:'snowflake' },
    { name:'inviterId',        type:'snowflake' }, // may be null at runtime
    { name:'createdTimestamp', type:'timestamp_ms' },
    { name:'expiresTimestamp', type:'timestamp_ms' },
    { name:'maxAge',           type:'int' },
    { name:'maxUses',          type:'int' },
    { name:'temporary',        type:'boolean' },
    { name:'uses',             type:'int' },
  ],
};

/** Map domain types to “final form” primitives for Break Object pins. */
export function toFinalPrimitive(type){
  const k = colorKeyFor(type);
  switch (k) {
    case 'snowflake':     return 'string';      // id → string
    case 'timestamp_ms':
    case 'duration_ms':   return 'int';         // explicit integer
    case 'number':
    case 'int':
    case 'float':         return 'number';
    case 'boolean':       return 'boolean';
    case 'bigint':        return 'bigint';
    case 'url':           return 'string';
    case 'color':         return 'string';      // hex string
    default:              return 'string';      // safe fallback
  }
}
