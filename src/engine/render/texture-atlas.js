import { getPackBlob } from "../assets/bedrock-pack-loader.js";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const nextPowerOfTwo = (value) => 2 ** Math.ceil(Math.log2(Math.max(1, value)));

async function decodeTga(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (bytes.length < 18) throw new Error("TGA truncado");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const idLength = bytes[0], colorMapType = bytes[1], imageType = bytes[2];
  const width = view.getUint16(12, true), height = view.getUint16(14, true);
  const bits = bytes[16], descriptor = bytes[17];
  if (colorMapType !== 0 || !width || !height) throw new Error("TGA com color map ou dimensões inválidas não é suportado");
  if (![2, 3, 10, 11].includes(imageType)) throw new Error(`Tipo TGA não suportado: ${imageType}`);
  if (![8, 24, 32].includes(bits) || ((imageType === 3 || imageType === 11) && bits !== 8)) {
    throw new Error(`Profundidade TGA não suportada: ${bits}`);
  }
  const bytesPerPixel = bits >> 3;
  let cursor = 18 + idLength;
  const pixelCount = width * height;
  if (width > 8192 || height > 8192 || pixelCount > 4_194_304) throw new Error('TGA excede o limite seguro de 4 megapixels.');
  const rgba = new Uint8ClampedArray(pixelCount * 4);
  const topOrigin = Boolean(descriptor & 0x20), rightOrigin = Boolean(descriptor & 0x10);
  let written = 0;
  const writePixel = (pixel) => {
    const sourceIndex = written++;
    const row = Math.floor(sourceIndex / width), column = sourceIndex % width;
    const x = rightOrigin ? width - 1 - column : column;
    const y = topOrigin ? row : height - 1 - row;
    const target = (y * width + x) * 4;
    if (bits === 8) {
      rgba[target] = rgba[target + 1] = rgba[target + 2] = pixel[0];
      rgba[target + 3] = 255;
    } else {
      rgba[target] = pixel[2]; rgba[target + 1] = pixel[1]; rgba[target + 2] = pixel[0];
      rgba[target + 3] = bytesPerPixel === 4 ? pixel[3] : 255;
    }
  };
  const readPixel = () => {
    if (cursor + bytesPerPixel > bytes.length) throw new Error("Dados de pixels TGA truncados");
    const pixel = bytes.subarray(cursor, cursor + bytesPerPixel);
    cursor += bytesPerPixel;
    return pixel;
  };
  if (imageType === 2 || imageType === 3) {
    while (written < pixelCount) writePixel(readPixel());
  } else {
    while (written < pixelCount) {
      if (cursor >= bytes.length) throw new Error("Pacote RLE TGA truncado");
      const packet = bytes[cursor++], count = (packet & 0x7f) + 1;
      if (written + count > pixelCount) throw new Error("Pacote RLE TGA excede as dimensões");
      if (packet & 0x80) {
        const pixel = readPixel();
        for (let i = 0; i < count; i++) writePixel(pixel);
      } else {
        for (let i = 0; i < count; i++) writePixel(readPixel());
      }
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  canvas.getContext("2d", { alpha: true }).putImageData(new ImageData(rgba, width, height), 0, 0);
  return canvas;
}

async function readImageDimensions(blob, path) {
  const bytes = new Uint8Array(await blob.slice(0, 1024 * 1024).arrayBuffer());
  let width = 0, height = 0;
  const u32be = (offset) => bytes[offset] * 0x1000000 + (bytes[offset + 1] << 16) + (bytes[offset + 2] << 8) + bytes[offset + 3];
  const u16be = (offset) => (bytes[offset] << 8) | bytes[offset + 1];
  if (/\.tga$/i.test(path)) {
    if (bytes.length < 18) throw new Error('TGA truncado');
    width = bytes[12] | (bytes[13] << 8); height = bytes[14] | (bytes[15] << 8);
  } else if (bytes.length >= 24 && bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71) {
    width = u32be(16); height = u32be(20);
  } else if (bytes.length >= 30 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const kind = String.fromCharCode(...bytes.subarray(offset, offset + 4));
      const size = bytes[offset + 4] | (bytes[offset + 5] << 8) | (bytes[offset + 6] << 16) | (bytes[offset + 7] << 24);
      const data = offset + 8;
      if (kind === 'VP8X' && data + 10 <= bytes.length) {
        width = 1 + bytes[data + 4] + (bytes[data + 5] << 8) + (bytes[data + 6] << 16);
        height = 1 + bytes[data + 7] + (bytes[data + 8] << 8) + (bytes[data + 9] << 16); break;
      }
      if (kind === 'VP8L' && data + 5 <= bytes.length && bytes[data] === 0x2f) {
        width = 1 + bytes[data + 1] + ((bytes[data + 2] & 0x3f) << 8);
        height = 1 + ((bytes[data + 2] >> 6) & 3) + (bytes[data + 3] << 2) + ((bytes[data + 4] & 15) << 10); break;
      }
      if (kind === 'VP8 ' && data + 10 <= bytes.length && bytes[data + 3] === 0x9d && bytes[data + 4] === 1 && bytes[data + 5] === 0x2a) {
        width = (bytes[data + 6] | (bytes[data + 7] << 8)) & 0x3fff;
        height = (bytes[data + 8] | (bytes[data + 9] << 8)) & 0x3fff; break;
      }
      if (!size) break;
      offset = data + size + (size & 1);
    }
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xd8 || marker === 0xd9 || marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = u16be(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)) {
        height = u16be(offset + 3); width = u16be(offset + 5); break;
      }
      offset += length;
    }
  }
  if (!width || !height) throw new Error('Dimensões da imagem não reconhecidas.');
  if (width > 8192 || height > 8192 || width * height > 4_194_304) throw new Error('Imagem excede o limite seguro de 4 megapixels.');
  return { width, height };
}

async function decodeImage(blob, path, maxTextureEdge = 128) {
  if (blob.size > 24 * 1024 * 1024) throw new Error('Textura excede 24 MiB.');
  const dimensions = await readImageDimensions(blob, path);
  const scale = Math.min(1, maxTextureEdge / Math.max(dimensions.width, dimensions.height));
  const targetWidth = Math.max(1, Math.round(dimensions.width * scale));
  const targetHeight = Math.max(1, Math.round(dimensions.height * scale));
  if (/\.tga$/i.test(path)) {
    const image = await decodeTga(blob);
    if (scale >= 1) return image;
    const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: true }); context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, targetWidth, targetHeight); return canvas;
  }
  if (typeof createImageBitmap === 'function') {
    if (scale < 1) {
      try { return await createImageBitmap(blob, { resizeWidth: targetWidth, resizeHeight: targetHeight, resizeQuality: 'pixelated' }); }
      catch {
        const image = await createImageBitmap(blob);
        const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
        const context = canvas.getContext('2d', { alpha: true }); context.imageSmoothingEnabled = false;
        context.drawImage(image, 0, 0, targetWidth, targetHeight); image.close?.(); return canvas;
      }
    }
    return await createImageBitmap(blob);
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image(); image.decoding = 'async'; image.src = url; await image.decode();
    if (scale >= 1) return image;
    const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
    const context = canvas.getContext('2d', { alpha: true }); context.imageSmoothingEnabled = false;
    context.drawImage(image, 0, 0, targetWidth, targetHeight); return canvas;
  } finally { URL.revokeObjectURL(url); }
}
function createMissingTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 16;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ff00ff"; ctx.fillRect(0, 0, 16, 16);
  ctx.fillStyle = "#191919";
  for (let y = 0; y < 16; y += 8) for (let x = (y / 8 % 2) * 8; x < 16; x += 16) ctx.fillRect(x, y, 8, 8);
  return canvas;
}
function packShelves(items, maxSize, padding) {
  const area = items.reduce((sum, item) => sum + (item.width + padding * 2) * (item.height + padding * 2), 0);
  let width = clamp(nextPowerOfTwo(Math.ceil(Math.sqrt(area) * 1.22)), 256, maxSize);
  while (width <= maxSize) {
    let x = 0, y = 0, rowHeight = 0;
    for (const item of items) {
      const w = item.width + padding * 2, h = item.height + padding * 2;
      if (x + w > width) { x = 0; y += rowHeight; rowHeight = 0; }
      item.x = x + padding; item.y = y + padding;
      x += w; rowHeight = Math.max(rowHeight, h);
    }
    const height = nextPowerOfTwo(y + rowHeight);
    if (height <= maxSize) return { width, height };
    width *= 2;
  }
  throw new Error("O atlas excede o limite de textura desta GPU. Reduza a qualidade do pacote.");
}

export async function buildTextureAtlas(pack, registry, gl, { maxTextureEdge = 128, padding = 2 } = {}) {
  const maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) || 2048, 4096);
  const sources = new Map(), sourceByMaterial = new Map(), fallbackByMaterial = new Map();
  for (const material of registry.materials) {
    const override = pack.getOverrideFile?.(material.alias);
    const baseKey = material.file ? `base:${material.file}` : null;
    if (baseKey && !sources.has(baseKey)) sources.set(baseKey, { key: baseKey, path: material.file, blob: null });
    if (override) {
      const key = `override:${override.name}:${override.size}`;
      if (!sources.has(key)) sources.set(key, { key, path: override.name, blob: override });
      sourceByMaterial.set(material.id, key);
      if (baseKey) fallbackByMaterial.set(material.id, baseKey);
    } else if (baseKey) {
      sourceByMaterial.set(material.id, baseKey);
    }
  }
  const decoded = [], failures = [];
  for (const source of sources.values()) {
    try {
      const blob = source.blob || await getPackBlob(pack, source.path);
      if (!blob) throw new Error("arquivo ausente");
      const image = await decodeImage(blob, source.path, maxTextureEdge);
      const width = Math.max(1, image.width || image.naturalWidth || 1);
      const height = Math.max(1, image.height || image.naturalHeight || 1);
      const scale = Math.min(1, maxTextureEdge / Math.max(width, height));
      decoded.push({
        key: source.key, image,
        width: Math.max(1, Math.round(width * scale)),
        height: Math.max(1, Math.round(height * scale))
      });
    } catch (error) { failures.push({ path: source.path, reason: error.message }); }
  }
  const missing = createMissingTexture(), missingKey = sourceByMaterial.get(0);
  if (!missingKey || !decoded.some((item) => item.key === missingKey)) {
    decoded.unshift({ key: "__weblab_missing__", image: missing, width: 16, height: 16 });
  }
  const layout = packShelves(decoded, maxSize, padding);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width; canvas.height = layout.height;
  const context = canvas.getContext("2d", { alpha: true });
  context.imageSmoothingEnabled = false;
  for (const item of decoded) {
    context.drawImage(item.image, item.x - padding, item.y - padding, item.width + padding * 2, item.height + padding * 2);
    context.drawImage(item.image, item.x, item.y, item.width, item.height);
  }
  const rectByKey = new Map();
  for (const item of decoded) rectByKey.set(item.key, [
    item.x / layout.width,
    1 - (item.y + item.height) / layout.height,
    item.width / layout.width,
    item.height / layout.height
  ]);
  const missingRect = rectByKey.get(missingKey) || rectByKey.get(fallbackByMaterial.get(0)) || rectByKey.get("__weblab_missing__") || [0, 0, 1, 1];
  const rects = new Float32Array(registry.materials.length * 4);
  for (const material of registry.materials) {
    rects.set(rectByKey.get(sourceByMaterial.get(material.id)) || rectByKey.get(fallbackByMaterial.get(material.id)) || missingRect, material.id * 4);
  }
  return {
    canvas, rects, width: layout.width, height: layout.height,
    loadedTextures: decoded.length,
    overriddenTextures: [...sourceByMaterial.entries()].filter(([id, key]) => key.startsWith("override:") && rectByKey.has(key)).length,
    failedTextures: failures.length, failures
  };
}
