import { CHUNK_SIZE, Chunk } from "./chunk.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const floorDiv = (value, divisor) => Math.floor(value / divisor);
const chunkKey = (x, z) => `${x},${z}`;

function hash2(x, z, seed) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function hash3(x, y, z, seed) {
  let n = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 2246822519) ^ Math.imul(seed, 3266489917);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  n = Math.imul(n ^ (n >>> 13), 3266489917);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function valueNoise2(x, z, scale, seed) {
  const gx = x / scale, gz = z / scale;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fz);
}

function valueNoise3(x, y, z, scale, seed) {
  const gx = x / scale, gy = y / scale, gz = z / scale;
  const ix = Math.floor(gx), iy = Math.floor(gy), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fy = smooth(gy - iy), fz = smooth(gz - iz);
  const c000 = hash3(ix, iy, iz, seed), c100 = hash3(ix + 1, iy, iz, seed);
  const c010 = hash3(ix, iy + 1, iz, seed), c110 = hash3(ix + 1, iy + 1, iz, seed);
  const c001 = hash3(ix, iy, iz + 1, seed), c101 = hash3(ix + 1, iy, iz + 1, seed);
  const c011 = hash3(ix, iy + 1, iz + 1, seed), c111 = hash3(ix + 1, iy + 1, iz + 1, seed);
  const x00 = lerp(c000, c100, fx), x10 = lerp(c010, c110, fx);
  const x01 = lerp(c001, c101, fx), x11 = lerp(c011, c111, fx);
  return lerp(lerp(x00, x10, fy), lerp(x01, x11, fy), fz);
}

function fbm2(x, z, seed, baseScale, octaves = 4) {
  let total = 0, amplitude = 1, weight = 0, scale = baseScale;
  for (let octave = 0; octave < octaves; octave++) {
    total += valueNoise2(x, z, scale, seed + octave * 1013) * amplitude;
    weight += amplitude;
    amplitude *= 0.5;
    scale *= 0.5;
  }
  return total / weight;
}

function selectBiome(x, z, seed, mountainSignal) {
  const temperature = fbm2(x + 1200, z - 900, seed + 200, 220, 3);
  const moisture = fbm2(x - 750, z + 1450, seed + 500, 170, 3);
  if (mountainSignal > 0.68) return "mountains";
  if (temperature < 0.29) return "snowy";
  if (temperature > 0.63 && moisture < 0.40) return "desert";
  if (moisture > 0.57) return "forest";
  return "plains";
}

function sampleTerrain(x, z, seed, maxHeight, seaLevel) {
  const continental = fbm2(x, z, seed + 11, 220, 4);
  const hills = fbm2(x, z, seed + 47, 78, 4);
  const detail = fbm2(x, z, seed + 89, 24, 3);
  const mountainSignal = valueNoise2(x, z, 145, seed + 131);
  const ridges = 1 - Math.abs(valueNoise2(x, z, 52, seed + 173) * 2 - 1);
  const mountainStrength = smooth(clamp((mountainSignal - 0.56) / 0.24, 0, 1));
  const riverDistance = Math.abs(valueNoise2(x, z, 112, seed + 211) - 0.5);
  const river = riverDistance < 0.026 && continental > 0.27;
  const biome = selectBiome(x, z, seed, mountainSignal);

  let height = 16 + continental * 27 + hills * 16 + detail * 5;
  height += mountainStrength * (ridges * 31 + 4);
  height += Math.sin(x * 0.031 + seed * 0.01) * Math.cos(z * 0.027 - seed * 0.01) * 1.4;
  if (river) height = Math.min(height, seaLevel - 1 + riverDistance * 80);
  height = Math.floor(clamp(height, 5, maxHeight - 8));

  return { height, biome, river, temperature: fbm2(x, z, seed + 200, 220, 2) };
}

function resolveBlocks(registry) {
  const get = (fallback, ...names) => registry.resolveBlock(...names) || fallback;
  return {
    stone: get(1, "stone"),
    grass: get(2, "grass", "grass_block"),
    dirt: get(3, "dirt"),
    bedrock: get(1, "bedrock"),
    log: get(0, "log", "oak_log", "wood"),
    leaves: get(0, "leaves", "oak_leaves", "leaves_oak"),
    sand: get(3, "sand"),
    sandstone: get(1, "sandstone"),
    gravel: get(3, "gravel"),
    water: get(0, "water", "flowing_water"),
    snow: get(2, "snow", "snow_layer"),
    coal: get(1, "coal_ore"),
    iron: get(1, "iron_ore"),
    gold: get(1, "gold_ore"),
    diamond: get(1, "diamond_ore")
  };
}

export function createProceduralChunk(registry, chunkX, chunkZ, {
  height = 96,
  seed = 26060,
  seaLevel = 30
} = {}) {
  const blocks = resolveBlocks(registry);
  const chunk = new Chunk({ x: chunkX, z: chunkZ, height });
  const heights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
  const biomes = new Map();
  const minWorldX = chunkX * CHUNK_SIZE;
  const minWorldZ = chunkZ * CHUNK_SIZE;
  const maxSurface = height - 8;

  const set = (x, y, z, blockId) => {
    if (x < 0 || x >= CHUNK_SIZE || z < 0 || z >= CHUNK_SIZE || y < 0 || y >= height || !blockId) return;
    chunk.blocks[chunk.index(x, y, z)] = blockId;
  };

  for (let z = 0; z < CHUNK_SIZE; z++) {
    for (let x = 0; x < CHUNK_SIZE; x++) {
      const worldX = minWorldX + x, worldZ = minWorldZ + z;
      const terrain = sampleTerrain(worldX, worldZ, seed, maxSurface, seaLevel);
      const top = terrain.height;
      heights[x + z * CHUNK_SIZE] = top;
      biomes.set(terrain.biome, (biomes.get(terrain.biome) || 0) + 1);

      const desert = terrain.biome === "desert";
      const snowy = terrain.biome === "snowy";
      const beach = top >= seaLevel - 3 && top <= seaLevel + 2;
      const surface = desert || beach ? blocks.sand : snowy ? blocks.snow : blocks.grass;
      const subsurface = desert ? blocks.sandstone : blocks.dirt;

      for (let y = 0; y <= top; y++) {
        let id = blocks.stone;
        if (y <= 2 && hash3(worldX, y, worldZ, seed + 17) > 0.22) {
          id = blocks.bedrock;
        } else if (y === top) {
          id = surface;
        } else if (y >= top - (desert ? 4 : 3)) {
          id = subsurface;
        } else {
          const caveNoise = valueNoise3(worldX, y, worldZ, 23, seed + 1901);
          const caveDetail = valueNoise3(worldX + 91, y - 37, worldZ - 57, 11, seed + 2903);
          const cave = y > 5 && y < top - 4 && caveNoise > 0.68 && caveDetail > 0.39;
          if (cave) {
            id = y < seaLevel - 4 ? blocks.water : 0;
          } else {
            const ore = hash3(worldX, y, worldZ, seed + 3203);
            if (y < 18 && ore > 0.9994) id = blocks.diamond;
            else if (y < 34 && ore > 0.9975) id = blocks.gold;
            else if (y < 58 && ore > 0.991) id = blocks.iron;
            else if (y < 76 && ore > 0.980) id = blocks.coal;
          }
        }
        set(x, y, z, id);
      }

      if (top < seaLevel) {
        for (let y = top + 1; y <= seaLevel; y++) set(x, y, z, blocks.water);
        if (terrain.river && blocks.gravel) set(x, Math.max(1, top), z, blocks.gravel);
      }
    }
  }

  // Deterministic trees are anchored away from chunk borders to avoid half-trees.
  if (blocks.log && blocks.leaves) {
    for (let z = 2; z < CHUNK_SIZE - 2; z++) {
      for (let x = 2; x < CHUNK_SIZE - 2; x++) {
        const worldX = minWorldX + x, worldZ = minWorldZ + z;
        const top = heights[x + z * CHUNK_SIZE];
        const terrain = sampleTerrain(worldX, worldZ, seed, maxSurface, seaLevel);
        const chance = terrain.biome === "forest" ? 0.982 : terrain.biome === "plains" ? 0.995 : 1;
        if (hash2(worldX, worldZ, seed + 4001) < chance || top <= seaLevel + 1) continue;
        if (terrain.biome === "desert" || terrain.biome === "snowy") continue;

        const trunkHeight = 4 + Math.floor(hash2(worldX, worldZ, seed + 4003) * 3);
        for (let y = 1; y <= trunkHeight; y++) set(x, top + y, z, blocks.log);
        const crownY = top + trunkHeight;
        for (let dy = -1; dy <= 2; dy++) {
          const layerRadius = dy === 2 ? 1 : 2;
          for (let dz = -layerRadius; dz <= layerRadius; dz++) {
            for (let dx = -layerRadius; dx <= layerRadius; dx++) {
              if (Math.abs(dx) === layerRadius && Math.abs(dz) === layerRadius && dy !== -1) continue;
              if (dx === 0 && dz === 0 && dy < 1) continue;
              set(x + dx, crownY + dy, z + dz, blocks.leaves);
            }
          }
        }
      }
    }
  }

  chunk.biomeCounts = Object.fromEntries(biomes);
  chunk.seed = seed;
  return chunk;
}

export function createProceduralWorld(registry, options = {}) {
  const chunks = new Map();
  const key = chunkKey;
  const world = {
    chunks,
    seed: Number.isInteger(options.seed) ? options.seed : 26060,
    height: options.height || 96,
    seaLevel: options.seaLevel || 30,
    generateChunk(chunkX, chunkZ) {
      const id = key(chunkX, chunkZ);
      let chunk = chunks.get(id);
      if (!chunk) {
        chunk = createProceduralChunk(registry, chunkX, chunkZ, world);
        chunks.set(id, chunk);
      }
      return chunk;
    },
    unloadChunk(chunkX, chunkZ) {
      return chunks.delete(key(chunkX, chunkZ));
    },
    getChunk(chunkX, chunkZ) {
      return chunks.get(key(chunkX, chunkZ)) || null;
    },
    getBlockAtWorld(x, y, z) {
      if (y < 0 || y >= world.height) return 0;
      const chunkX = floorDiv(x, CHUNK_SIZE), chunkZ = floorDiv(z, CHUNK_SIZE);
      const chunk = chunks.get(key(chunkX, chunkZ));
      if (!chunk) return 0;
      const localX = x - chunkX * CHUNK_SIZE, localZ = z - chunkZ * CHUNK_SIZE;
      return chunk.get(localX, y, localZ);
    },
    getNeighborLookup(chunk) {
      return (localX, y, localZ) => world.getBlockAtWorld(
        chunk.x * CHUNK_SIZE + localX,
        y,
        chunk.z * CHUNK_SIZE + localZ
      );
    },
    getSurfaceAtWorld(x, z) {
      return sampleTerrain(x, z, world.seed, world.height - 8, world.seaLevel);
    },
    getBiomeAtWorld(x, z) {
      return sampleTerrain(x, z, world.seed, world.height - 8, world.seaLevel).biome;
    }
  };
  return world;
}

// Kept for compatibility with the initial fixed-world demo and older tests.
export function createDemoWorld(registry, { radius = 2, height = 64, seed = 26060 } = {}) {
  const world = createProceduralWorld(registry, { height, seed });
  for (let cz = -radius; cz < radius; cz++) {
    for (let cx = -radius; cx < radius; cx++) world.generateChunk(cx, cz);
  }
  return {
    chunks: [...world.chunks.values()],
    getBlockAtWorld: world.getBlockAtWorld,
    getNeighborLookup: world.getNeighborLookup,
    seed: world.seed,
    height: world.height
  };
}
