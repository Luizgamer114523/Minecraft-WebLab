const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export class FirstPersonController {
  constructor(canvas, { sensitivity = 0.0028, speed = 10.5 } = {}) {
    this.canvas = canvas;
    this.sensitivity = sensitivity;
    this.speed = speed;
    this.position = [20, 24, 24];
    this.yaw = -Math.PI / 4;
    this.pitch = -0.22;
    this.keys = new Set();
    this.joystick = { x: 0, y: 0 };
    this.lookTouch = null;
    this.pointerLocked = false;
    this.bindEvents();
  }

  bindEvents() {
    this.onKeyDown = (event) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "KeyC"].includes(event.code)) {
        event.preventDefault(); this.keys.add(event.code);
      }
    };
    this.onKeyUp = (event) => this.keys.delete(event.code);
    this.onPointerLock = () => { this.pointerLocked = document.pointerLockElement === this.canvas; };
    this.onPointerMove = (event) => { if (this.pointerLocked) this.rotate(event.movementX, event.movementY); };
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
        this.lookTouch.x = touch.clientX; this.lookTouch.y = touch.clientY;
        event.preventDefault();
      }
    };
    this.onTouchEnd = (event) => {
      if (this.lookTouch && [...event.changedTouches].some((touch) => touch.identifier === this.lookTouch.id)) this.lookTouch = null;
    };
    window.addEventListener("keydown", this.onKeyDown, { passive: false });
    window.addEventListener("keyup", this.onKeyUp);
    document.addEventListener("pointerlockchange", this.onPointerLock);
    document.addEventListener("mousemove", this.onPointerMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("touchstart", this.onTouchStart, { passive: true });
    this.canvas.addEventListener("touchmove", this.onTouchMove, { passive: false });
    this.canvas.addEventListener("touchend", this.onTouchEnd, { passive: true });
    this.canvas.addEventListener("touchcancel", this.onTouchEnd, { passive: true });

    const joystick = document.getElementById("joystick"), stick = document.getElementById("joystick-stick");
    if (joystick && stick) {
      let activeId = null;
      const update = (touch) => {
        const rect = joystick.getBoundingClientRect();
        const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
        const radius = rect.width * 0.34, dx = touch.clientX - cx, dy = touch.clientY - cy;
        const length = Math.max(1, Math.hypot(dx, dy)), scale = Math.min(1, radius / length);
        this.joystick.x = dx * scale / radius;
        this.joystick.y = dy * scale / radius;
        stick.style.transform = `translate(${this.joystick.x * radius}px, ${this.joystick.y * radius}px)`;
      };
      joystick.addEventListener("touchstart", (event) => {
        event.preventDefault(); activeId = event.changedTouches[0].identifier; update(event.changedTouches[0]);
      }, { passive: false });
      joystick.addEventListener("touchmove", (event) => {
        const touch = [...event.changedTouches].find((item) => item.identifier === activeId);
        if (touch) { event.preventDefault(); update(touch); }
      }, { passive: false });
      const end = (event) => {
        if (![...event.changedTouches].some((item) => item.identifier === activeId)) return;
        activeId = null; this.joystick.x = this.joystick.y = 0; stick.style.transform = "translate(0,0)";
      };
      joystick.addEventListener("touchend", end, { passive: true });
      joystick.addEventListener("touchcancel", end, { passive: true });
    }
    const up = document.getElementById("move-up"), down = document.getElementById("move-down");
    up?.addEventListener("touchstart", (event) => { event.preventDefault(); this.keys.add("Space"); }, { passive: false });
    const stopUp = () => this.keys.delete("Space");
    up?.addEventListener("touchend", stopUp);
    up?.addEventListener("touchcancel", stopUp);
    down?.addEventListener("touchstart", (event) => { event.preventDefault(); this.keys.add("KeyC"); }, { passive: false });
    const stopDown = () => this.keys.delete("KeyC");
    down?.addEventListener("touchend", stopDown);
    down?.addEventListener("touchcancel", stopDown);
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
    x += this.joystick.x; z -= this.joystick.y;
    if (this.keys.has("Space")) y++;
    if (this.keys.has("KeyC")) y--;
    const length = Math.hypot(x, z);
    if (length > 1) { x /= length; z /= length; }
    const multiplier = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 2.2 : 1;
    const velocity = this.speed * multiplier * deltaTime;
    this.position[0] += (right[0] * x + forward[0] * z) * velocity;
    this.position[2] += (right[2] * x + forward[2] * z) * velocity;
    this.position[1] += y * velocity;
  }

  dispose() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    document.removeEventListener("pointerlockchange", this.onPointerLock);
    document.removeEventListener("mousemove", this.onPointerMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("touchstart", this.onTouchStart);
    this.canvas.removeEventListener("touchmove", this.onTouchMove);
    this.canvas.removeEventListener("touchend", this.onTouchEnd);
    this.canvas.removeEventListener("touchcancel", this.onTouchEnd);
  }
}
