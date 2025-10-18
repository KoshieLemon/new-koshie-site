import './events-ui.js';
import { printDiagnostics } from '../../api.js';
import { gid, gname, gicon, total, online } from './config.js';
import { els, setGuildHeader } from './dom.js';
import { fitSvg, renderAll } from '../render/render.js';
import { initInteractions } from '../interactions/interactions.js';
import { initBlueprints } from '../blueprints/blueprints.js';

printDiagnostics('bot-options.html');
setGuildHeader({ gid, gname, gicon, total, online });
fitSvg();
window.addEventListener('resize', fitSvg);

// Wire editor interactions and blueprint UI.
initInteractions();
initBlueprints(gid).then(renderAll);
