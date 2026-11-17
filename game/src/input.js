// Vice Harbor — keyboard and mouse state.
// One Input object listens on the window; the game polls it each frame.
// Keys are stored by KeyboardEvent.code so layouts do not matter.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedOnce = new Set(); // codes that went down since the last frame poll
    this.mouseX = 0;               // in canvas pixels (the 1280x800 stage space)
    this.mouseY = 0;
    this.mouseDown = false;
    this.clickedOnce = false;
    this.canvas = canvas;

    window.addEventListener('keydown', (e) => {
      if (!e.repeat) this.pressedOnce.add(e.code);
      this.keys.add(e.code);
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = ((e.clientX - rect.left) / rect.width) * canvas.width;
      this.mouseY = ((e.clientY - rect.top) / rect.height) * canvas.height;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.clickedOnce = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Is any of these codes currently held? */
  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  /** Was any of these codes pressed since the last endFrame()? */
  tapped(...codes) {
    return codes.some((c) => this.pressedOnce.has(c));
  }

  /** Call once per frame after polling, to clear the one-shot sets. */
  endFrame() {
    this.pressedOnce.clear();
    this.clickedOnce = false;
  }

  /** The steering axis: -1 left, +1 right, from keys. */
  steerAxis() {
    return (this.down('KeyD', 'ArrowRight') ? 1 : 0) - (this.down('KeyA', 'ArrowLeft') ? 1 : 0);
  }

  /** The throttle axis: +1 forward, -1 back/brake. */
  throttleAxis() {
    return (this.down('KeyW', 'ArrowUp') ? 1 : 0) - (this.down('KeyS', 'ArrowDown') ? 1 : 0);
  }
}
