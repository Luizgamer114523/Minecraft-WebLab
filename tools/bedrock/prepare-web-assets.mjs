#!/usr/bin/env node
/**
 * Prepare a local Bedrock resource-pack export for WebLab.
 * Reads the extracted Minecraft APK resource_packs directory and expands
 * Mojang's BRArchive bundles. The proprietary game assets stay local and
 * are intentionally excluded from Git by .gitignore.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const MAGIC = Buffer.from([0x7d, 0x27, 0x25, 0xb1, 0xa0, 0x52, 0x70, 0x26]);
const ALLOWED_ROOTS = new Set([
  'blocks.json', 'biomes_client.json', 'manifest.json', 'manifest_publish.json',
  'contents.json', 'textures', 'materials', 'models', 'entity', 'animations',
  'animation_controllers', 'render_controllers', 'particles', 'fogs', 'block_culling'
]);
const EXTENSIONS = ['', '.png', '.tga', '.jpg', '.jpeg', '.webp'];

function argsOf(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') { args.help = true; continue; }
    if (!arg.startsWith('--') || i + 1 >= argv.length) throw new Error('Argumento inválido: ' + arg);
    args[arg.slice(2)] = argv[++i];
  }
  return args;
}

function safeRelative(value) {
  const normalized = path.posix.normalize(String(value).replaceAll('\\', '/'));
  if (!normalized || normalized === '.' || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    throw new Error('Caminho inseguro no recurso: ' + value);
  }
  return normalized;
}

function allowed(relativePath) {
  return ALLOWED_ROOTS.has(relativePath.split('/')[0]);
}

async function listFiles(root) {
  const result = [];
  async function walk(dir) {
    let entries;
    try { entries = await fs.readdir(dir, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) result.push(full);
    }
  }
  await walk(root);
  return result;
}

async function copyPackFiles(packRoot, outputRoot) {
  const files = await listFiles(packRoot);
  let copied = 0;
  for (const source of files) {
    const rel = path.relative(packRoot, source).split(path.sep).join('/');
    if (rel.split('/').includes('__brarchive') || !allowed(rel)) continue;
    const target = path.join(outputRoot, ...rel.split('/'));
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
    copied++;
  }
  return copied;
}

async function expandBrArchives(packRoot, outputRoot) {
  const files = await listFiles(packRoot);
  let archives = 0, entries = 0, bytes = 0;
  for (const source of files.filter(file => file.endsWith('.brarchive'))) {
    const rel = path.relative(packRoot, source).split(path.sep).join('/');
    if (!rel.startsWith('__brarchive/')) continue;
    const archiveRel = rel.slice('__brarchive/'.length).replace(/\\.brarchive$/, '');
    const destinationRoot = safeRelative(archiveRel);
    if (!allowed(destinationRoot)) continue;

    const data = await fs.readFile(source);
    if (data.length < 16 || !data.subarray(0, 8).equals(MAGIC)) throw new Error('BRArchive inválido: ' + rel);
    const count = data.readUInt32LE(8);
    if (count > 100000) throw new Error('Contagem improvável em ' + rel + ': ' + count);
    const dataStart = 16 + count * 256;
    if (dataStart > data.length) throw new Error('Tabela BRArchive truncada: ' + rel);

    for (let i = 0; i < count; i++) {
      const recordStart = 16 + i * 256;
      const nameLength = data[recordStart];
      if (nameLength < 1 || nameLength > 239) throw new Error('Nome de entrada inválido em ' + rel + ' #' + i);
      const memberName = data.subarray(recordStart + 1, recordStart + 1 + nameLength).toString('utf8');
      const member = safeRelative(memberName);
      const offset = data.readUInt32LE(recordStart + 248);
      const size = data.readUInt32LE(recordStart + 252);
      const start = dataStart + offset;
      const end = start + size;
      if (end > data.length || end < start) throw new Error('Entrada fora do arquivo: ' + rel + ' :: ' + memberName);
      const relativeOutput = safeRelative(destinationRoot + '/' + member);
      if (!allowed(relativeOutput)) continue;
      const target = path.join(outputRoot, ...relativeOutput.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.writeFile(target, data.subarray(start, end));
      entries++;
      bytes += size;
    }
    archives++;
  }
  return { archives, entries, bytes };
}

function stripJsonComments(source) {
  let out = '', inString = false, escaped = false, lineComment = false, blockComment = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i], next = source[i + 1];
    if (lineComment) { if (c === '\n') { lineComment = false; out += '\n'; } continue; }
    if (blockComment) { if (c === '*' && next === '/') { blockComment = false; i++; } else if (c === '\n') out += '\n'; continue; }
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === '/' && next === '/') { lineComment = true; i++; continue; }
    if (c === '/' && next === '*') { blockComment = true; i++; continue; }
    out += c;
  }
  return out.replace(/,\\s*([}\\]])/g, '$1');
}

async function readJson(file, required = true) {
  try { return JSON.parse(stripJsonComments(await fs.readFile(file, 'utf8'))); }
  catch (error) {
    if (!required && error.code === 'ENOENT') return {};
    throw new Error('Falha lendo ' + file + ': ' + error.message);
  }
}

function flattenTexturePaths(value) {
  if (typeof value === 'string') return [{ path: value }];
  if (Array.isArray(value)) return value.flatMap(flattenTexturePaths);
  if (value && typeof value === 'object') {
    if (typeof value.path === 'string') return [{ path: value.path, overlay_color: value.overlay_color, tint_color: value.tint_color }];
    if (Object.hasOwn(value, 'textures')) return flattenTexturePaths(value.textures);
  }
  return [];
}

async function findTexture(outputRoot, texturePath) {
  const normalized = safeRelative(texturePath.startsWith('textures/') ? texturePath : 'textures/blocks/' + texturePath);
  for (const extension of EXTENSIONS) {
    const relative = normalized.endsWith(extension) && extension ? normalized : normalized + extension;
    try {
      const stat = await fs.stat(path.join(outputRoot, ...relative.split('/')));
      if (stat.isFile()) return relative;
    } catch { /* test next extension */ }
  }
  return null;
}

async function buildIndex(outputRoot, baseRoot, patchRoot, patchName) {
  const baseBlocks = await readJson(path.join(baseRoot, 'blocks.json'));
  const patchBlocks = await readJson(path.join(patchRoot, 'blocks.json'), false);
  const blockDefs = { ...baseBlocks, ...patchBlocks };
  const baseTerrain = await readJson(path.join(baseRoot, 'textures', 'terrain_texture.json'));
  const patchTerrain = await readJson(path.join(patchRoot, 'textures', 'terrain_texture.json'), false);
  const terrain = {
    ...baseTerrain,
    ...patchTerrain,
    texture_data: { ...(baseTerrain.texture_data || {}), ...(patchTerrain.texture_data || {}) }
  };
  const textureData = terrain.texture_data || {};
  await fs.writeFile(path.join(outputRoot, 'blocks.json'), JSON.stringify(blockDefs, null, 2));
  await fs.mkdir(path.join(outputRoot, 'textures'), { recursive: true });
  await fs.writeFile(path.join(outputRoot, 'textures', 'terrain_texture.json'), JSON.stringify(terrain, null, 2));
  const textureIndex = {};
  let textureRefs = 0, missingTextures = 0;

  for (const [key, value] of Object.entries(textureData)) {
    const raw = value && typeof value === 'object' && Object.hasOwn(value, 'textures') ? value.textures : value;
    const candidates = [];
    for (const item of flattenTexturePaths(raw)) {
      textureRefs++;
      const file = await findTexture(outputRoot, item.path);
      if (!file) missingTextures++;
      candidates.push({ ...item, file, available: Boolean(file) });
    }
    textureIndex[key] = { candidates };
  }

  const blocks = {};
  for (const [name, def] of Object.entries(blockDefs)) {
    if (name === 'format_version' || !def || typeof def !== 'object') continue;
    const faces = {};
    const source = def.textures;
    if (typeof source === 'string') faces.all = source;
    else if (source && typeof source === 'object') {
      for (const [face, key] of Object.entries(source)) if (typeof key === 'string') faces[face] = key;
    }
    blocks[name] = {
      faces,
      isotropic: def.isotropic ?? false,
      sound: def.sound ?? null,
      carried_textures: def.carried_textures ?? null,
      ambient_occlusion_exponent: def.ambient_occlusion_exponent ?? null
    };
  }

  const index = {
    schema: 'minecraft-weblab/bedrock-resource-index@1',
    source: { resource_pack: 'vanilla', game_version: '1.26.60', overlay: patchName },
    atlas: { texture_name: terrain.texture_name || 'atlas.terrain', padding: terrain.padding ?? 8, num_mip_levels: terrain.num_mip_levels ?? 4 },
    stats: {
      blocks: Object.keys(blocks).length,
      texture_keys: Object.keys(textureIndex).length,
      texture_references: textureRefs,
      unresolved_texture_references: missingTextures
    },
    blocks,
    textures: textureIndex
  };
  await fs.writeFile(path.join(outputRoot, 'bedrock-resource-index.json'), JSON.stringify(index, null, 2));
  return index.stats;
}

async function main() {
  const args = argsOf(process.argv);
  if (args.help || !args.input || !args.output) {
    console.log('Uso: node tools/bedrock/prepare-web-assets.mjs --input <resource_packs> --output <pasta-de-saida>');
    console.log('Exemplo: node tools/bedrock/prepare-web-assets.mjs --input ~/minecraft-extracted/assets/assets/resource_packs --output public/bedrock-assets');
    console.log('Entrada esperada: resource_packs/vanilla + resource_packs/vanilla_1.26.50. O conteúdo gerado é local e não deve ser enviado a repositório público.');
    if (!args.help) process.exitCode = 2;
    return;
  }

  const inputRoot = path.resolve(args.input.replace(/^~(?=\\/|$)/, process.env.HOME || '~'));
  const outputRoot = path.resolve(args.output.replace(/^~(?=\\/|$)/, process.env.HOME || '~'));
  const base = path.join(inputRoot, 'vanilla');
  const patchName = args.patch || 'vanilla_1.26.50';
  const patch = path.join(inputRoot, patchName);
  await fs.access(path.join(base, 'blocks.json'));
  await fs.access(path.join(base, 'textures', 'terrain_texture.json'));
  await fs.access(path.join(patch, 'manifest.json'));
  await fs.rm(outputRoot, { recursive: true, force: true });
  await fs.mkdir(outputRoot, { recursive: true });

  const baseFiles = await copyPackFiles(base, outputRoot);
  const baseBundles = await expandBrArchives(base, outputRoot);
  const patchFiles = await copyPackFiles(patch, outputRoot);
  const patchBundles = await expandBrArchives(patch, outputRoot);
  const stats = await buildIndex(outputRoot, base, patch, patchName);
  const report = {
    tool: 'Minecraft WebLab Bedrock Resource Importer',
    schema: 1,
    source: 'user-provided extracted Minecraft Bedrock resource pack',
    gameVersion: '1.26.60',
    overlay: patchName,
    filesCopied: baseFiles + patchFiles + baseBundles.entries + patchBundles.entries,
    brarchivesExpanded: baseBundles.archives + patchBundles.archives,
    brarchiveEntriesExpanded: baseBundles.entries + patchBundles.entries,
    blockIndex: stats,
    note: 'Generated assets are proprietary Minecraft resources. Keep them local or in private storage; do not publish them in a public Git repository.'
  };
  await fs.writeFile(path.join(outputRoot, 'IMPORT-REPORT.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
