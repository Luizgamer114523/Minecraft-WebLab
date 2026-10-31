const FACE_BY_NORMAL = new Map([
  ["1,0,0", ["east", "side", "all"]],
  ["-1,0,0", ["west", "side", "all"]],
  ["0,1,0", ["up", "top", "all"]],
  ["0,-1,0", ["down", "bottom", "all"]],
  ["0,0,1", ["south", "side", "all"]],
  ["0,0,-1", ["north", "side", "all"]]
]);

function shortName(name) {
  const value = String(name || "");
  return value.includes(":") ? value.slice(value.lastIndexOf(":") + 1) : value;
}

export function createBedrockRegistry(index) {
  if (!index || typeof index !== "object" || !index.blocks || !index.textures) {
    throw new TypeError("Índice Bedrock inválido: blocks/textures ausentes.");
  }

  const aliases = Object.keys(index.textures).sort();
  const aliasToMaterialId = new Map([["missing", 0]]);
  const missingCandidate = (index.textures.missing?.candidates || []).find((candidate) => candidate?.available && candidate.file);
  const materials = [{ id: 0, alias: "missing", file: missingCandidate?.file || null }];
  for (const alias of aliases) {
    if (alias === "missing") continue;
    const candidates = index.textures[alias]?.candidates || [];
    const selected = candidates.find((candidate) => candidate?.available && candidate.file) || candidates[0];
    aliasToMaterialId.set(alias, materials.length);
    materials.push({ id: materials.length, alias, file: selected?.file || null });
  }

  const blocks = [{ id: 0, name: "minecraft:air", faces: {} }];
  const blockByName = new Map();
  for (const [name, definition] of Object.entries(index.blocks)) {
    if (name === "format_version" || !definition || typeof definition !== "object") continue;
    if (blocks.length > 65535) throw new RangeError("O índice possui mais de 65.535 definições de bloco.");
    const id = blocks.length;
    const entry = { id, name, faces: definition.faces || {} };
    blocks.push(entry);
    blockByName.set(name, id);
    const short = shortName(name);
    if (!blockByName.has(short)) blockByName.set(short, id);
  }

  function resolveBlock(...names) {
    for (const name of names.flat()) {
      if (!name) continue;
      const direct = blockByName.get(name) ?? blockByName.get(shortName(name));
      if (direct) return direct;
    }
    return 0;
  }

  function getFaceMaterialId(blockId, normal) {
    const block = blocks[blockId];
    if (!block) return 0;
    const candidates = FACE_BY_NORMAL.get(\`\${normal[0]},\${normal[1]},\${normal[2]}\`) || ["all"];
    for (const face of candidates) {
      const alias = block.faces?.[face];
      if (typeof alias === "string") return aliasToMaterialId.get(alias) ?? 0;
    }
    return 0;
  }

  return {
    blocks,
    materials,
    resolveBlock,
    getFaceMaterialId,
    stats: {
      blockCount: blocks.length - 1,
      materialCount: materials.length - 1,
      unresolved: index.stats?.unresolved_texture_references ?? null
    }
  };
}
