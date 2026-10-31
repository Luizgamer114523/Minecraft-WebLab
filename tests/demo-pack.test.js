import test from "node:test";
import assert from "node:assert/strict";
import { createDemoBedrockPack } from "../src/engine/assets/demo-pack.js";

test("demo pack generates every texture without an out-of-range palette index", async () => {
  const previousDocument = globalThis.document;
  const previousImageData = globalThis.ImageData;
  const generatedImages = [];

  globalThis.ImageData = class ImageData {
    constructor(data, width, height) {
      this.data = data;
      this.width = width;
      this.height = height;
    }
  };
  globalThis.document = {
    createElement(tag) {
      assert.equal(tag, "canvas");
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({
        putImageData(imageData) {
          assert.equal(imageData.width, 16);
          assert.equal(imageData.height, 16);
          assert.equal(imageData.data.length, 16 * 16 * 4);
          generatedImages.push(imageData);
        }
      });
      canvas.toBlob = (callback, type) => callback(new Blob([new Uint8Array(16 * 16 * 4)], { type }));
      return canvas;
    }
  };

  try {
    const pack = await createDemoBedrockPack();
    const aliases = Object.keys(pack.index.textures);
    assert.ok(aliases.includes("water"));
    assert.ok(generatedImages.length >= aliases.length);

    for (const image of generatedImages) {
      for (let i = 0; i < image.data.length; i++) {
        assert.ok(Number.isInteger(image.data[i]) && image.data[i] >= 0 && image.data[i] <= 255);
      }
    }
    for (const [alias, definition] of Object.entries(pack.index.textures)) {
      const path = definition.candidates[0].file;
      const blob = await pack.getFile(path);
      assert.ok(blob instanceof Blob, `${alias} should resolve to a Blob`);
      assert.ok(blob.size > 0, `${alias} texture should not be empty`);
    }
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousImageData === undefined) delete globalThis.ImageData;
    else globalThis.ImageData = previousImageData;
  }
});
