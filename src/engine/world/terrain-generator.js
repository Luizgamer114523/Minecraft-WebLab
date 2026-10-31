import { CHUNK_SIZE, Chunk } from "./chunk.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

function hash2(x, z, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise(x, z, scale, seed) {
  const gx = x / scale, gz = z / scale;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function surfaceHeight(x, z, seed, maxHeight) {
  const broad = valueNoise(x, z, 38, seed + 11) * 12;
  const detail = valueNoise(x, z, 13, seed + 37) * 5;
  const fine = valueNoise(x, z, 5, seed + 71) * 1.7;
  const ridge = Math.sin(x * 0.052 + seed) * Math.cos(z * 0.047 - seed) * 1.3;
  return clamp(Math.floor(7 + broad + detail + fine + ridge), 5, maxHeight - 9);
}

const floorDiv = (value, divisor) => Math.floor(value / divisor);

export function createDemoWorld(registry, { radius = 2, height = 64, seed = 26060 } = {}) {
  const block = {
    grass: registry.resolveBlock("grass", "grass_block"),
    dirt: registry.resolveBlock("dirt", "coarse_dirt"),
    stone: registry.resolveBlock("stone", "cobblestone"),
    bedrock: registry.resolveBlock("bedrock", "stone"),
    log: registry.resolveBlock("log", "oak_log", "wood"),
    leaves: registry.resolveBlock("leaves", "oak_leaves", "leaves_oak")
  };
  if (!block.grass || !block.dirt || !block.stone) {
    throw new Error("O pacote não contém as definições necessárias de grama, terra e pedra.");
  }

  const chunks = new Map();
  const key = (cx, cz) => \`\${cx},\${cz}\`;
  for (let cz = -radius; cz < radius; cz++) {
    for (let cx = -radius; cx < radius; cx++) {
      chunks.set(key(cx, cz), new Chunk({ x: cx, z: cz, height }));
    }
  }

  const getChunkAt = (x, z) => chunks.get(key(floorDiv(x, CHUNK_SIZE), floorDiv(z, CHUNK_SIZE)));
  const setBlockAt = (x, y, z, id) => {
    if (y < 0 || y >= height) return;
    const chunk = getChunkAt(x, z);
    if (!chunk) return;
    const lx = x - chunk.x * CHUNK_SIZE;
    const lz = z - chunk.z * CHUNK_SIZE;
    chunk.blocks[chunk.index(lx, y, lz)] = id;
  };

  for (let z = -radius * CHUNK_SIZE; z < radius * CHUNK_SIZE; z++) {
    for (let x = -radius * CHUNK_SIZE; x < radius * CHUNK_SIZE; x++) {
      const top = surfaceHeight(x, z, seed, height);
      for (let y = 0; y <= top; y++) {
        let id = block.stone;
        if (y === 0) id = block.bedrock;
        else if (y === top) id = block.grass;
        else if (y >= top - 3) id = block.dirt;
        setBlockAt(x, y, z, id);
      }
    }
  }

  if (block.log && block.leaves) {
    for (let z = -radius * CHUNK_SIZE + 2; z < radius * CHUNK_SIZE - 2; z++) {
      for (let x = -radius * CHUNK_SIZE + 2; x < radius * CHUNK_SIZE - 2; x++) {
        if (hash2(x, z, seed + 101) < 0.986) continue;
        const top = surfaceHeight(x, z, seed, height);
        const trunkHeight = 4 + Math.floor(hash2(x, z, seed + 103) * 2);
        for (let y = 1; y <= trunkHeight; y++) setBlockAt(x, top + y, z, block.log);
        const crown = top + trunkHeight;
        for (let dy = -1; dy <= 2; dy++) {
          const radiusAtLayer = dy === 2 ? 1 : 2;
          for (let dz = -radiusAtLayer; dz <= radiusAtLayer; dz++) {
            for (let dx = -radiusAtLayer; dx <= radiusAtLayer; dx++) {
              if (Math.abs(dx) === radiusAtLayer && Math.abs(dz) === radiusAtLayer && dy !== -1) continue;
              if (dx === 0 && dz === 0 && dy < 1) continue;
              setBlockAt(x + dx, crown + dy, z + dz, block.leaves);
            }
          }
        }
      }
    }
  }

  const getBlockAtWorld = (x, y, z) => {
    if (y < 0 || y >= height) return 0;
    const chunk = getChunkAt(x, z);
    if (!chunk) return 0;
    return chunk.get(x - chunk.x * CHUNK_SIZE, y, z - chunk.z * CHUNK_SIZE);
  };

  return {
    chunks: [...chunks.values()],
    getBlockAtWorld,
    getNeighborLookup(chunk) {
      return (localX, y, localZ) => getBlockAtWorld(chunk.x * CHUNK_SIZE + localX, y, chunk.z * CHUNK_SIZE + localZ);
    },
    seed,
    height
  };
}
