// Orchestrator: re-exports modular renderer pieces.
// Keep existing imports in other files working.
export { fitSvg, bezierPath, getPinCenter, drawWires } from './render.wires.js';
export { buildNodeDOM } from './render.node.js';
export { renderNode, renderAll, registerNodeInteractions } from './render.editor.js';
