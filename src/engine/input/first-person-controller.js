const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class FirstPersonController {
  constructor(canvas, {
    sensitivity = 0.0028,
    speed = 10.5,
    getGroundHeight = null,
    eyeHeight = 1.65
  } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.speed = speed;
    this.getGroundHeight = typeof getGroundHeight === "function" ? getGroundHeight : null;
    this.eyeHeight = Math.max(0.5, Number(eyeHeight) || 1.65);
    this.position = [20, 24, 24];
    this.yaw = -Math.PI / 4;
    this.pitch = -0.22;
    this.keys = new Set();
    this.joystick = { x: 0, y: 0 };
    this.lookTouch = null;
    this.pointerLocked = false;
    this.cleanups = [];
    this.bindEvents();
  }

  listen(target, type, handler, options) {
    if (!target) return;
    target.addEventListener(type, handler, options);
    this.cleanups.push(() => target.removeEventListener(type, handler, options));
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyC"].includes(event.code)) {
        event.preventDefault();
        this.keys.add(event.code);
      }
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onBlur = () => {
      this.keys.clear();
      this.joystick.x = 0;
      this.joystick.y = 0;
      this.lookTouch = null;
    };
    this.onPointerLock = () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    };
    this.onPointerMove = (event) => {
      if (this.pointerLocked) this.rotate(event.movementX, event.movementY);
    };
    this.onMouseDown = () => {
      if (!this.pointerLocked && matchMedia("(pointer:fine)").matches) this.canvas.requestPointerLock?.();
    };
    this.onTouchStart = (event) => {
      if (this.lookTouch) return;
      for (const touch of event.changedTouches) {
        if (touch.clientX < window.innerWidth * 0.48) continue;
        this.lookTouch = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
        break;
      }
    };
    this.onTouchMove = (event) => {
      if (!this.lookTouch) return;
      for (const touch of event.changedTouches) {
        if (touch.identifier !== this.lookTouch.id) continue;
        this.rotate(touch.clientX - this.lookTouch.x, touch.clientY - this.lookTouch.y);
        this.lookTouch.x = touch.clientX;
        this.lookTouch.y = touch.clientY;
        event.preventDefault();
      }
    };
    this.onTouchEnd = (event) => {
      if (this.lookTouch && [...event.changedTouches].some((touch) => touch.identifier === this.lookTouch.id)) {
        this.lookTouch = null;
      }
    };

    this.listen(window, "keydown", this.onKeyDown, { passive: false });
    this.listen(window, "keyup", this.onKeyUp);
    this.listen(window, "blur", this.onBlur);
    this.listen(document, "visibilitychange", () => { if (document.hidden) this.onBlur(); });
    this.listen(document, "pointerlockchange", this.onPointerLock);
    this.listen(document, "mousemove", this.onPointerMove);
    this.listen(this.canvas, "mousedown", this.onMouseDown);
    this.listen(this.canvas, "touchstart", this.onTouchStart, { passive: true });
    this.listen(this.canvas, "touchmove", this.onTouchMove, { passive: false });
    this.listen(this.canvas, "touchend", this.onTouchEnd, { passive: true });
    this.listen(this.canvas, "touchcancel", this.onTouchEnd, { passive: true });

    const joystick = document.getElementById("joystick");
    const stick = document.getElementById("joystick-stick");
    if (joystick && stick) {
      let activeId = null;
      const update = (touch) => {
        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const radius = Math.max(1, rect.width * 0.34);
        const dx = touch.clientX - cx;
        const dy = touch.clientY - cy;
        const length = Math.max(1, Math.hypot(dx, dy));
        const scale = Math.min(1, radius / length);
        this.joystick.x = dx * scale / radius;
        this.joystick.y = dy * scale / radius;
        stick.style.transform = `translate(${this.joystick.x * radius}px, ${this.joystick.y * radius}px)`;
      };
      const start = (event) => {
        event.preventDefault();
        activeId = event.changedTouches[0].identifier;
        update(event.changedTouches[0]);
      };
      const move = (event) => {
        const touch = [...event.changedTouches].find((item) => item.identifier === activeId);
        if (touch) {
          event.preventDefault();
          update(touch);
        }
      };
      const end = (event) => {
        if (![...event.changedTouches].some((item) => item.identifier === activeId)) return;
        activeId = null;
        this.joystick.x = 0;
        this.joystick.y = 0;
        stick.style.transform = "translate(0,0)";
      };
      this.listen(joystick, "touchstart", start, { passive: false });
      this.listen(joystick, "touchmove", move, { passive: false });
      this.listen(joystick, "touchend", end, { passive: true });
      this.listen(joystick, "touchcancel", end, { passive: true });
    }

    const bindVerticalButton = (id, code) => {
      const button = document.getElementById(id);
      if (!button) return;
      const start = (event) => {
        event.preventDefault();
        this.keys.add(code);
        button.setPointerCapture?.(event.pointerId);
      };
      const stop = () => this.keys.delete(code);
      this.listen(button, "pointerdown", start, { passive: false });
      this.listen(button, "pointerup", stop);
      this.listen(button, "pointercancel", stop);
      this.listen(button, "lostpointercapture", stop);
      this.listen(button, "contextmenu", (event) => event.preventDefault());
    };
    bindVerticalButton("move-up", "Space");
    bindVerticalButton("move-down", "KeyC");
  }

  rotate(dx, dy) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = clamp(this.pitch - dy * this.sensitivity, -1.48, 1.48);
  }

  update(deltaTime) {
    const forward = [Math.sin(this.yaw), 0, -Math.cos(this.yaw)];
    const right = [Math.cos(this.yaw), 0, Math.sin(this.yaw)];
    let x = 0, z = 0, y = 0;
    if (this.keys.has("KeyW")) z++;
    if (this.keys.has("KeyS")) z--;
    if (this.keys.has("KeyD")) x++;
    if (this.keys.has("KeyA")) x--;
    x += this.joystick.x;
    z -= this.joystick.y;
    if (this.keys.has("Space")) y++;
    if (this.keys.has("KeyC")) y--;

    const length = Math.hypot(x, z);
    if (length > 1) {
      x /= length;
      z /= length;
    }
    const multiplier = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 2.2 : 1;
    const velocity = this.speed * Math.max(0, Math.min(deltaTime, 0.05)) * multiplier;
    this.position[0] += (right[0] * x + forward[0] * z) * velocity;
    this.position[2] += (right[2] * x + forward[2] * z) * velocity;
    this.position[1] += y * velocity;

    // Creative-style vertical movement remains available, but the camera cannot cross terrain.
    if (this.getGroundHeight) {
      const ground = this.getGroundHeight(this.position[0], this.position[2]);
      if (Number.isFinite(ground)) {
        this.position[1] = Math.max(this.position[1], ground + this.eyeHeight);
      }
    }
  }

  dispose() {
    this.onBlur();
    for (const cleanup of this.cleanups.splice(0)) cleanup();
    if (this.pointerLocked) document.exitPointerLock?.();
  }
}
