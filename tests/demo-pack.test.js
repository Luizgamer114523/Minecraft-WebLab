import test from "node:test";
import assert from "node:assert/strict";
import { createDemoBedrockPack } from "../src/engine/assets/demo-pack.js";

test("demo pack loads the supplied block textures instead of procedural placeholders", async () => {
  const pack = await createDemoBedrockPack();
  const expected = [
    "grass_top", "grass_side", "dirt", "stone", "bedrock", "log", "leaves",
    "sand", "sandstone", "gravel", "coal_ore", "iron_ore", "gold_ore",
    "diamond_ore", "snow", "water"
  ];
  assert.deepEqual(Object.keys(pack.index.textures).sort(), [...expected].sort());
  assert.equal(pack.index.source.resource_pack, "WebLab user texture test pack");

  for (const alias of expected) {
    const path = pack.index.textures[alias].candidates[0].file;
    const blob = await pack.getFile(path);
    assert.ok(blob instanceof Blob, `${alias} should resolve to a PNG Blob`);
    assert.ok(blob.size > 100, `${alias} should contain actual image data`);
    const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    assert.deepEqual([...header.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    const width = new DataView(header.buffer).getUint32(16);
    const height = new DataView(header.buffer).getUint32(20);
    assert.ok(width >= 32 && height >= 32, `${alias} should retain pixel detail`);
  }
});
