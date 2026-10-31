import { DEMO_TEXTURES } from "./demo-textures.js";

export async function createDemoBedrockPack() {
  const aliases = Object.keys(DEMO_TEXTURES);
  const textures = new Map();
  for (const alias of aliases) {
    const binary = atob(DEMO_TEXTURES[alias]);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    textures.set(`demo/${alias}.png`, new Blob([bytes], { type: "image/png" }));
  }

  const textureIndex = Object.fromEntries(aliases.map((alias) => [
    alias,
    { candidates: [{ path: `demo/${alias}.png`, file: `demo/${alias}.png`, available: true }] }
  ]));

  const blocks = {
    "minecraft:grass_block": {
      faces: { up: "grass_top", top: "grass_top", side: "grass_side", down: "dirt", bottom: "dirt" }
    },
    "minecraft:dirt": { faces: { all: "dirt" } },
    "minecraft:stone": { faces: { all: "stone" } },
    "minecraft:bedrock": { faces: { all: "bedrock" } },
    "minecraft:oak_log": { faces: { up: "log", down: "log", side: "log", all: "log" } },
    "minecraft:oak_leaves": { faces: { all: "leaves" } },
    "minecraft:sand": { faces: { all: "sand" } },
    "minecraft:sandstone": { faces: { all: "sandstone" } },
    "minecraft:gravel": { faces: { all: "gravel" } },
    "minecraft:water": { faces: { all: "water" } },
    "minecraft:snow": { faces: { all: "snow" } },
    "minecraft:coal_ore": { faces: { all: "coal_ore" } },
    "minecraft:iron_ore": { faces: { all: "iron_ore" } },
    "minecraft:gold_ore": { faces: { all: "gold_ore" } },
    "minecraft:diamond_ore": { faces: { all: "diamond_ore" } }
  };

  return {
    index: {
      schema: "minecraft-weblab/demo-resource-index@1",
      source: { resource_pack: "WebLab user texture test pack", game_version: "texture-test", overlay: null },
      stats: { blocks: Object.keys(blocks).length, texture_keys: aliases.length, texture_references: aliases.length, unresolved_texture_references: 0 },
      blocks,
      textures: textureIndex
    },
    getFile: async (path) => textures.get(String(path).replaceAll("\\", "/")) || null,
    fileCount: textures.size
  };
}
