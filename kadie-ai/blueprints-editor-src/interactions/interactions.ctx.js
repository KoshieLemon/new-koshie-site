// interactions.ctx.js
// Shared interaction state and constants.

export const ix = {
  NODE_W: 200,
  NODE_H: 92,
  drag: null,          // dragging selected nodes
  dragWire: null,      // active wire being drawn
  panning: null,       // middle-mouse panning
  lockedWire: null,    // wire locked after dropping on canvas for palette-connect
  marquee: null,       // marquee selection overlay
  wireHint: null       // floating status tag
};
