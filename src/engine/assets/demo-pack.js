const PALETTES = {
  grass_top: ["#4d8f35", "#5b9e3d", "#3f7a2e", "#68a947"],
  grass_side: ["#684b2d", "#735332", "#5a4028", "#4d8b35"],
  dirt: ["#795333", "#6e492d", "#865d3b", "#60442b"],
  stone: ["#7b7b7b", "#686868", "#898989", "#5c5c5c"],
  bedrock: ["#474747", "#333333", "#5a5a5a", "#262626"],
  log: ["#80572f", "#93683b", "#684728", "#a07846"],
  leaves: ["#326d2e", "#3c7d35", "#245c27", "#4b873b"]
};

function hash(x, y, seed) {
  let value = Math.imul(x + seed, 0x45d9f3b) ^ Math.imul(y - seed, 0x27d4eb2d);
  value = Math.imul(value ^ (value >>> 15), 0x85ebca6b);
  return (value ^ (value >>> 13)) >>> 0;
}

function makeTexture(alias) {
  const colors = PALETTES[alias];
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Canvas 2D indisponível para gerar o pacote de demonstração.");

  const pixels = new Uint8ClampedArray(16 * 16 * 4);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let paletteIndex = hash(x, y, alias.length) % colors.length;
      if (alias === "grass_side" && y < 3) paletteIndex = hash(x, y, 7) % 2 ? 0 : 1;
      if (alias === "log" && x > 5 && x < 10) paletteIndex = 1;
      if (alias === "leaves" && hash(x, y, 13) % 7 === 0) paletteIndex = 3;

      const hex = colors[paletteIndex].slice(1);
      const index = (y * 16 + x) * 4;
      pixels[index] = parseInt(hex.slice(0, 2), 16);
      pixels[index + 1] = parseInt(hex.slice(2, 4), 16);
      pixels[index + 2] = parseInt(hex.slice(4, 6), 16);
      pixels[index + 3] = 255;
    }
  }
  context.putImageData(new ImageData(pixels, 16, 16), 0, 0);

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Não foi possível gerar uma textura de demonstração."));
    }, "image/png");
  });
}

export async function createDemoBedrockPack() {
  const aliases = Object.keys(PALETTES);
  const textures = new Map();
  for (const alias of aliases) {
    textures.set(`demo/${alias}.png`, await makeTexture(alias));
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
    "minecraft:oak_log": { faces: { all: "log" } },
    "minecraft:oak_leaves": { faces: { all: "leaves" } }
  };

  return {
    index: {
      schema: "minecraft-weblab/demo-resource-index@1",
      source: { resource_pack: "WebLab generated demo", game_version: "not-applicable", overlay: null },
      stats: { blocks: Object.keys(blocks).length, texture_keys: aliases.length, texture_references: aliases.length, unresolved_texture_references: 0 },
      blocks,
      textures: textureIndex
    },
    getFile: async (path) => textures.get(String(path).replaceAll("\\", "/")) || null,
    fileCount: textures.size
  };
}
