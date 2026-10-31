import test from "node:test";
import assert from "node:assert/strict";
import { FirstPersonController } from "../src/engine/input/first-person-controller.js";

class EventTargetMock {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }
  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }
  listenerCount() {
    return [...this.listeners.values()].reduce((total, handlers) => total + handlers.size, 0);
  }
}

test("mobile camera remains above procedural terrain and still supports upward movement", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fakeWindow = new EventTargetMock();
  fakeWindow.innerWidth = 800;
  const fakeDocument = new EventTargetMock();
  fakeDocument.hidden = false;
  fakeDocument.pointerLockElement = null;
  fakeDocument.getElementById = () => null;
  const canvas = new EventTargetMock();
  canvas.requestPointerLock = () => {};
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;

  try {
    const controller = new FirstPersonController(canvas, {
      getGroundHeight: () => 12,
      eyeHeight: 1.65
    });
    controller.position = [0, 2, 0];
    controller.update(1 / 60);
    assert.ok(Math.abs(controller.position[1] - 13.65) < 1e-9);

    controller.keys.add("Space");
    controller.update(1 / 60);
    assert.ok(controller.position[1] > 13.65);
    controller.dispose();
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});

test("controller disposal removes every registered event listener", () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const fakeWindow = new EventTargetMock();
  fakeWindow.innerWidth = 800;
  const fakeDocument = new EventTargetMock();
  fakeDocument.hidden = false;
  fakeDocument.pointerLockElement = null;
  fakeDocument.getElementById = () => null;
  const canvas = new EventTargetMock();
  canvas.requestPointerLock = () => {};
  globalThis.window = fakeWindow;
  globalThis.document = fakeDocument;

  try {
    const controller = new FirstPersonController(canvas);
    assert.ok(fakeWindow.listenerCount() > 0);
    assert.ok(fakeDocument.listenerCount() > 0);
    assert.ok(canvas.listenerCount() > 0);
    controller.dispose();
    assert.equal(fakeWindow.listenerCount(), 0);
    assert.equal(fakeDocument.listenerCount(), 0);
    assert.equal(canvas.listenerCount(), 0);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
});
