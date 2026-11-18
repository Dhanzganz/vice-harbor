// Vice Harbor — keyboard and mouse state.
// One shared state object: `down` for held keys, `pressed` for keys that went
// down this frame (main clears it at the end of every update via endFrame),
// mouse position in canvas pixels and a click latch for shooting. Movement
// reads `down`; one-shot actions (punch, enter, pause) read `pressed`.

export const input = {
  down: new Set(),
  pressed: new Set(),
  mouseX: 640,
  mouseY: 400,
  mouseDown: false,
  clicked: false,
};

const GAME_KEYS = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyP', 'Space', 'ShiftLeft', 'ShiftRight',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Escape', 'KeyC', 'KeyM',
]);

export function attachInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.down.add(e.code);
  });
  window.addEventListener('keyup', (e) => { input.down.delete(e.code); });
  window.addEventListener('blur', () => { input.down.clear(); input.mouseDown = false; });

  const toCanvas = (e) => {
    const r = canvas.getBoundingClientRect();
    input.mouseX = (e.clientX - r.left) * (canvas.width / r.width);
    input.mouseY = (e.clientY - r.top) * (canvas.height / r.height);
  };
  canvas.addEventListener('mousemove', toCanvas);
  canvas.addEventListener('mousedown', (e) => {
    toCanvas(e);
    if (e.button === 0) { input.mouseDown = true; input.clicked = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) input.mouseDown = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function axisX() {
  return (input.down.has('KeyD') || input.down.has('ArrowRight') ? 1 : 0)
       - (input.down.has('KeyA') || input.down.has('ArrowLeft') ? 1 : 0);
}
export function axisY() {
  return (input.down.has('KeyS') || input.down.has('ArrowDown') ? 1 : 0)
       - (input.down.has('KeyW') || input.down.has('ArrowUp') ? 1 : 0);
}
export function running() { return input.down.has('ShiftLeft') || input.down.has('ShiftRight'); }
export function endFrame() { input.pressed.clear(); input.clicked = false; }
