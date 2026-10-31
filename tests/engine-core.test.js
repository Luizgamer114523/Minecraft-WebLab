import test from "node:test";
import assert from "node:assert/strict";
import { Chunk } from "../src/engine/world/chunk.js";
import { buildGreedyMesh } from "../src/engine/world/greedy-mesher.js";
import { createBedrockRegistry } from "../src/engine/world/bedrock-registry.js";

const emptyMesh = (chunk) => buildGreedyMesh(chunk, () => 0, () => 7);

test("Chunk keeps air at zero and increments revisions on edits", () => {
  const chunk = new Chunk({ height: 8 });
  assert.equal(chunk.get(1, 1, 1), 0);
  assert.equal(chunk.set(1, 1, 1, 4), true);
  assert.equal(chunk.get(1, 1, 1), 4);
  assert.equal(chunk.revision, 1);
  assert.equal(chunk.set(1, 1, 1, 4), false);
  assert.equal(chunk.revision, 1);
});

test("A single voxel produces six correctly wound quads", () => {
  const chunk = new Chunk({ height: 2 });
  chunk.set(0, 0, 0, 1);
  const mesh = emptyMesh(chunk);
  assert.equal(mesh.quadCount, 6);
  assert.equal(mesh.vertexCount, 36);
  for (let face = 0; face < 6; face++) {
    const offset = face * 18;
    const a = mesh.positions.slice(offset, offset + 3);
    const b = mesh.positions.slice(offset + 3, offset + 6);
    const c = mesh.positions.slice(offset + 6, offset + 9);
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const normal = mesh.normals.slice(offset, offset + 3);
    assert.ok(cross[0] * normal[0] + cross[1] * normal[1] + cross[2] * normal[2] > 0, `face ${face} winding`);
  }
});

test("Greedy meshing merges coplanar faces with equal block and material", () => {
  const chunk = new Chunk({ height: 2 });
  chunk.set(0, 0, 0, 1);
  chunk.set(1, 0, 0, 1);
  assert.equal(emptyMesh(chunk).quadCount, 6);
  const differentBlocks = new Chunk({ height: 2 });
  differentBlocks.set(0, 0, 0, 1);
  differentBlocks.set(1, 0, 0, 2);
  const separateMaterials = buildGreedyMesh(differentBlocks, () => 0, () => 7);
  assert.equal(separateMaterials.quadCount, 10);
});

test("Neighbor lookup hides chunk boundary faces", () => {
  const left = new Chunk({ x: 0, z: 0, height: 2 });
  const right = new Chunk({ x: 1, z: 0, height: 2 });
  left.set(15, 0, 0, 1);
  right.set(0, 0, 0, 1);
  const mesh = buildGreedyMesh(left, (x, y, z) => x === 16 ? right.get(0, y, z) : 0, () => 1);
  assert.equal(mesh.quadCount, 5);
});

test("Bedrock registry resolves face-specific aliases", () => {
  const registry = createBedrockRegistry({
    blocks: { grass: { faces: { up: "grass_top", down: "dirt", side: "grass_side" } } },
    textures: {
      grass_top: { candidates: [{ file: "textures/grass_top.png", available: true }] },
      grass_side: { candidates: [{ file: "textures/grass_side.png", available: true }] },
      dirt: { candidates: [{ file: "textures/dirt.png", available: true }] }
    },
    stats: { unresolved_texture_references: 0 }
  });
  const grass = registry.resolveBlock("grass");
  assert.ok(grass > 0);
  assert.notEqual(registry.getFaceMaterialId(grass, [0, 1, 0]), registry.getFaceMaterialId(grass, [1, 0, 0]));
  assert.equal(registry.stats.blockCount, 1);
});
