const IMAGE_EXTENSIONS = ["", ".png", ".tga", ".jpg", ".jpeg", ".webp"];

function cleanJson(source) {
  let out = "", inString = false, escaped = false, lineComment = false, blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === "\n") { lineComment = false; out += "\n"; } continue; }
    if (blockComment) { if (c === "*" && next === "/") { blockComment = false; i++; } else if (c === "\n") out += "\n"; continue; }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && next === "/") { lineComment = true; i++; continue; }
    if (c === "/" && next === "*") { blockComment = true; i++; continue; }
    out += c;
  }
  return out.replace(/,\s*([}\]])/g, "$1");
}
function normalizePath(value) {
  return String(value || "").replaceAll("\\", "/").replace(/^\.\//, "");
}
function flattenTexturePaths(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(flattenTexturePaths);
  if (value && typeof value === "object") {
    if (typeof value.path === "string") return [value.path];
    if (Object.hasOwn(value, "textures")) return flattenTexturePaths(value.textures);
  }
  return [];
}
async function readOptional(file) {
  if (!file) return null;
  try { return JSON.parse(cleanJson(await file.text())); }
  catch (error) { throw new Error(`JSON inválido em ${file.name}: ${error.message}`); }
}
function parseBlockFaces(definition) {
  const source = definition?.textures;
  if (typeof source === "string") return { all: source };
  if (!source || typeof source !== "object") return {};
  const faces = {};
  for (const [face, value] of Object.entries(source)) if (typeof value === "string") faces[face] = value;
  return faces;
}

async function readBoundedBlob(stream, maximumBytes, fileName) {
  const reader = stream.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel();
        throw new Error('ZIP recusado: descompactação excede o limite para ' + fileName + '.');
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Blob(chunks);
}

async function expandZipArchive(zipFile) {
  // Read only the ZIP tail and central directory. Never duplicate the whole archive in RAM.
  const tailLength = Math.min(zipFile.size, 65557);
  const tailStart = zipFile.size - tailLength;
  const tail = new Uint8Array(await zipFile.slice(tailStart).arrayBuffer());
  const tailView = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  let endOffset = -1;
  for (let cursor = tail.length - 22; cursor >= Math.max(0, tail.length - 65557); cursor--) {
    if (tailView.getUint32(cursor, true) === 0x06054b50) { endOffset = cursor; break; }
  }
  if (endOffset < 0) throw new Error("ZIP inválido: diretório central não encontrado.");
  const entryCount = tailView.getUint16(endOffset + 10, true);
  const centralSize = tailView.getUint32(endOffset + 12, true);
  const centralOffset = tailView.getUint32(endOffset + 16, true);
  if (entryCount > 10000) throw new Error("ZIP recusado: mais de 10.000 arquivos.");
  if (centralSize > 16 * 1024 * 1024 || centralOffset + centralSize > zipFile.size) {
    throw new Error("ZIP recusado: diretório central inválido ou grande demais.");
  }
  const centralBytes = new Uint8Array(await zipFile.slice(centralOffset, centralOffset + centralSize).arrayBuffer());
  const view = new DataView(centralBytes.buffer, centralBytes.byteOffset, centralBytes.byteLength);
  const output = [];
  let cursor = 0, totalExpanded = 0;
  const maxFileBytes = 12 * 1024 * 1024, maxTotalBytes = 64 * 1024 * 1024;

  for (let entry = 0; entry < entryCount; entry++) {
    if (cursor + 46 > centralBytes.length || view.getUint32(cursor, true) !== 0x02014b50) {
      throw new Error("ZIP inválido: entrada central corrompida.");
    }
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true), expandedSize = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const entryEnd = cursor + 46 + nameLength + extraLength + commentLength;
    if (entryEnd > centralBytes.length) throw new Error("ZIP inválido: nome ou metadados truncados.");
    const name = new TextDecoder().decode(centralBytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor = entryEnd;

    if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.split(/[\\\\/]/).includes("..")) {
      throw new Error("ZIP recusado: caminho interno inseguro.");
    }
    const safeName = normalizePath(name);
    if (!safeName || safeName.endsWith("/")) continue;
    if ((flags & 1) !== 0) throw new Error("ZIP protegido por senha não é suportado: " + safeName);
    if (expandedSize > maxFileBytes) throw new Error("Arquivo muito grande dentro do ZIP (limite 12 MiB): " + safeName);
    if (expandedSize > maxTotalBytes - totalExpanded) {
      throw new Error("ZIP excede 64 MiB descompactados. Use o pacote Bedrock WebLab otimizado.");
    }
    if (![0, 8].includes(method)) throw new Error("Método ZIP não suportado (" + method + "): " + safeName);
    if (localOffset + 30 > zipFile.size) throw new Error("Cabeçalho local fora do ZIP: " + safeName);

    const localHeader = new DataView(await zipFile.slice(localOffset, localOffset + 30).arrayBuffer());
    if (localHeader.getUint32(0, true) !== 0x04034b50) throw new Error("Cabeçalho local inválido: " + safeName);
    const localNameLength = localHeader.getUint16(26, true), localExtraLength = localHeader.getUint16(28, true);
    const payloadStart = localOffset + 30 + localNameLength + localExtraLength;
    const payloadEnd = payloadStart + compressedSize;
    if (payloadEnd > zipFile.size || payloadEnd < payloadStart) throw new Error("Dados truncados no ZIP: " + safeName);
    const compressedBlob = zipFile.slice(payloadStart, payloadEnd);

    let blob;
    if (method === 0) {
      if (compressedSize !== expandedSize) throw new Error("Tamanho inválido no arquivo armazenado: " + safeName);
      blob = compressedBlob;
    } else {
      if (typeof DecompressionStream !== "function") {
        throw new Error("Este navegador não oferece descompactação ZIP por DEFLATE.");
      }
      const stream = compressedBlob.stream().pipeThrough(new DecompressionStream("deflate-raw"));
      blob = await readBoundedBlob(stream, Math.min(maxFileBytes, maxTotalBytes - totalExpanded), safeName);
    }
    if (blob.size !== expandedSize) throw new Error("Tamanho descompactado inesperado: " + safeName);
    totalExpanded += blob.size;
    const file = new File([blob], safeName.split("/").pop(), { type: "application/octet-stream" });
    Object.defineProperty(file, "webkitRelativePath", { value: safeName });
    output.push(file);
  }
  return output;
}
function makeFileIndex(files) {
  return [...files].map((file) => ({ file, path: normalizePath(file.webkitRelativePath || file.name) }));
}
function findRoot(entries, marker) {
  const entry = entries.find((item) => item.path.endsWith(`/${marker}`) || item.path === marker);
  if (!entry) return null;
  return entry.path.slice(0, entry.path.length - marker.length);
}
function findFile(entries, root, relativePath) {
  const clean = normalizePath(relativePath);
  if (!clean || clean.startsWith("/") || clean.split("/").includes("..")) return null;
  const exact = entries.find((item) => item.path === `${root}${clean}` || item.path === clean);
  return exact?.file || entries.find((item) => item.path.endsWith(`/${clean}`))?.file || null;
}

async function makeIndexFromResourcePack(entries, root) {
  const blocksFile = findFile(entries, root, "blocks.json");
  const terrainFile = findFile(entries, root, "textures/terrain_texture.json");
  if (!blocksFile || !terrainFile) throw new Error("Não encontrei bedrock-resource-index.json nem blocks.json + textures/terrain_texture.json.");
  const rawBlocks = await readOptional(blocksFile);
  const terrain = await readOptional(terrainFile);
  const textureData = terrain?.texture_data || {}, textures = {};
  let references = 0, unresolved = 0;
  for (const [alias, definition] of Object.entries(textureData)) {
    const candidates = [];
    for (const path of flattenTexturePaths(definition)) {
      references++;
      let file = null;
      for (const extension of IMAGE_EXTENSIONS) {
        file = findFile(entries, root, path.endsWith(extension) && extension ? path : path + extension);
        if (file) break;
      }
      if (!file) unresolved++;
      const relativeFile = file ? normalizePath(file.webkitRelativePath || file.name).slice(root.length) : null;
      candidates.push({ path, file: relativeFile, available: Boolean(file) });
    }
    textures[alias] = { candidates };
  }
  const blocks = {};
  for (const [name, definition] of Object.entries(rawBlocks || {})) {
    if (name === "format_version" || !definition || typeof definition !== "object") continue;
    blocks[name] = { faces: parseBlockFaces(definition) };
  }
  return {
    schema: "minecraft-weblab/bedrock-resource-index@browser",
    source: { resource_pack: "user-import", game_version: "unknown", overlay: null },
    atlas: { texture_name: terrain.texture_name || "atlas.terrain", padding: terrain.padding ?? 8, num_mip_levels: terrain.num_mip_levels ?? 4 },
    stats: { blocks: Object.keys(blocks).length, texture_keys: Object.keys(textures).length, texture_references: references, unresolved_texture_references: unresolved },
    blocks, textures
  };
}

export async function loadBedrockPackFromFiles(fileList) {
  const selected = [...fileList], entriesToLoad = [];
  for (const file of selected) {
    if (/\.zip$/i.test(file.name)) entriesToLoad.push(...await expandZipArchive(file));
    else entriesToLoad.push(file);
  }
  const entries = makeFileIndex(entriesToLoad);
  const indexEntry = entries.find((item) => item.path.endsWith("bedrock-resource-index.json"));
  const root = indexEntry
    ? indexEntry.path.slice(0, indexEntry.path.lastIndexOf("bedrock-resource-index.json"))
    : findRoot(entries, "blocks.json");
  if (root === null) throw new Error("A pasta selecionada não contém os arquivos do pacote Bedrock.");
  const index = indexEntry ? await readOptional(indexEntry.file) : await makeIndexFromResourcePack(entries, root);
  const getFile = (relativePath) => findFile(entries, root, relativePath);
  return { index, getFile, root, fileCount: entries.length };
}

export async function loadTextureOverridesFromZip(zipFile) {
  const files = await expandZipArchive(zipFile), byName = new Map();
  for (const file of files) {
    if (!/\.(png|jpe?g|webp|tga)$/i.test(file.name)) continue;
    const base = file.name.replace(/_textura_512px(?=\.)/i, "").replace(/\.[^.]+$/, "").toLowerCase();
    if (!byName.has(base)) byName.set(base, file);
  }
  if (!byName.size) throw new Error("O ZIP não contém imagens PNG, TGA, JPEG ou WebP.");
  const aliases = { log_side: ["oak_log", "log"], leaves: ["oak_leaves"], planks: ["oak_planks"] };
  return {
    count: byName.size,
    getOverrideFile(alias) {
      for (const name of [alias, ...(aliases[alias] || [])].map((value) => String(value).toLowerCase())) {
        if (byName.has(name)) return byName.get(name);
      }
      return null;
    }
  };
}

export async function loadHostedBedrockPack(baseUrl = "/bedrock-assets/") {
  // Prefer the unpacked static index when a full pack is deployed as individual files.
  const response = await fetch(`${baseUrl}bedrock-resource-index.json`, { cache: "no-cache" });
  if (response.ok) {
    const index = await response.json();
    const getFile = async (relativePath) => {
      const safePath = normalizePath(relativePath);
      if (!safePath || safePath.startsWith("/") || safePath.split("/").includes("..")) return null;
      const result = await fetch(`${baseUrl}${safePath}`, { cache: "force-cache" });
      return result.ok ? await result.blob() : null;
    };
    return { index, getFile, root: baseUrl, fileCount: null };
  }

  // A compact ZIP is easier to deploy atomically and avoids phone-side import.
  const archiveResponse = await fetch(`${baseUrl}bedrock-core-pack.zip`, { cache: "no-cache" });
  if (!archiveResponse.ok) return null;
  const archiveBlob = await archiveResponse.blob();
  if (archiveBlob.size < 22 || archiveBlob.size > 8 * 1024 * 1024) {
    throw new Error("Pacote Bedrock hospedado tem tamanho inválido (limite 8 MiB).");
  }
  const signature = new Uint8Array(await archiveBlob.slice(0, 4).arrayBuffer());
  if (signature[0] !== 0x50 || signature[1] !== 0x4b) {
    throw new Error("Arquivo hospedado não é um ZIP Bedrock válido.");
  }
  const archiveFile = new File([archiveBlob], "bedrock-core-pack.zip", {
    type: "application/zip",
    lastModified: Date.now()
  });
  return loadBedrockPackFromFiles([archiveFile]);
}
export async function getPackBlob(pack, relativePath) {
  const result = pack.getFile(relativePath);
  if (!result) return null;
  return result instanceof Blob ? result : await result;
}
