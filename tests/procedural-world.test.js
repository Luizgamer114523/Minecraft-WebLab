import test from "node:test";
import assert from "node:assert/strict";
import { createProceduralChunk, createProceduralWorld } from "../src/engine/world/procedural-world.js";

const ids = {
  stone: 1, grass: 2, grass_block: 2, dirt: 3, bedrock: 4,
  log: 5, oak_log: 5, leaves: 6, oak_leaves: 6,
  sand: 7, sandstone: 8, gravel: 9, water: 10, snow: 11,
  coal_ore: 12, iron_ore: 13, gold_ore: 14, diamond_ore: 15
};
const registry = {
  resolveBlock(...names) {
    for (const name of names) if (ids[name]) return ids[name];
    return 0;
  }
};

test("procedural chunks are deterministic for the same seed and coordinates", () => {
  const a = createProceduralChunk(registry, -3, 7, { seed: 12345 });
  const b = createProceduralChunk(registry, -3, 7, { seed: 12345 });
  assert.deepEqual(a.blocks, b.blocks);
  assert.deepEqual(a.biomeCounts, b.biomeCounts);
  assert.ok(a.blocks.some((blockId) => blockId !== 0));
});

test("different seeds generate different terrain", () => {
  const a = createProceduralChunk(registry, 0, 0, { seed: 100 });
  const b = createProceduralChunk(registry, 0, 0, { seed: 200 });
  assert.notDeepEqual(a.blocks, b.blocks);
});

test("procedural world creates chunks on demand and unloads them", () => {
  const world = createProceduralWorld(registry, { seed: 26060 });
  assert.equal(world.chunks.size, 0);
  const chunk = world.generateChunk(0, 0);
  assert.equal(world.chunks.size, 1);
  assert.equal(world.getChunk(0, 0), chunk);
  assert.equal(world.getBlockAtWorld(0, 0, 0), ids.bedrock);
  assert.ok(["plains", "forest", "desert", "snowy", "mountains"].includes(world.getBiomeAtWorld(8, 8)));
  assert.equal(world.unloadChunk(0, 0), true);
  assert.equal(world.getBlockAtWorld(0, 0, 0), 0);
});

test("terrain height remains continuous across chunk borders", () => {
  const world = createProceduralWorld(registry, { seed: 9876 });
  const left = world.getSurfaceAtWorld(15, 8).height;
  const right = world.getSurfaceAtWorld(16, 8).height;
  assert.ok(Math.abs(left - right) < 18, `unexpected terrain cliff at chunk edge: ${left} -> ${right}`);
});
