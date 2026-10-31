import { CHUNK_SIZE } from "./chunk.js";

const DIRECTIONS = [
  { axis: 0, sign: 1, normal: [1, 0, 0] },
  { axis: 0, sign: -1, normal: [-1, 0, 0] },
  { axis: 1, sign: 1, normal: [0, 1, 0] },
  { axis: 1, sign: -1, normal: [0, -1, 0] },
  { axis: 2, sign: 1, normal: [0, 0, 1] },
  { axis: 2, sign: -1, normal: [0, 0, -1] }
];

/**
 * Builds a chunk surface mesh and merges adjacent coplanar faces only when
 * both the block ID and resolved face-material ID match. Zero is always air.
 */
export function buildGreedyMesh(
  chunk,
  getNeighborBlock = () => 0,
  getFaceMaterialId = (blockId) => blockId
) {
  const positions = [], normals = [], blockIds = [], materialIds = [], uvs = [];
  const dims = [CHUNK_SIZE, chunk.height, CHUNK_SIZE];
  const sample = (x, y, z) => chunk.inBounds(x, y, z)
    ? chunk.get(x, y, z)
    : (getNeighborBlock(x, y, z) || 0);

  for (const direction of DIRECTIONS) {
    const { axis, sign, normal } = direction;
    const uAxis = axis === 0 ? 2 : 0;
    const vAxis = axis === 1 ? 2 : 1;
    const width = dims[uAxis], height = dims[vAxis];
    const mask = new Uint32Array(width * height);

    for (let slice = 0; slice < dims[axis]; slice++) {
      mask.fill(0);
      for (let v = 0; v < height; v++) {
        for (let u = 0; u < width; u++) {
          const point = [0, 0, 0];
          point[axis] = slice;
          point[uAxis] = u;
          point[vAxis] = v;
          const blockId = sample(...point);
          if (!blockId) continue;
          const neighbor = [...point];
          neighbor[axis] += sign;
          if (sample(...neighbor)) continue;
          const materialId = getFaceMaterialId(blockId, normal);
          if (!Number.isInteger(materialId) || materialId < 0 || materialId > 65535) {
            throw new RangeError(`Invalid face material ID: ${materialId}`);
          }
          mask[u + v * width] = ((blockId << 16) | materialId) >>> 0;
        }
      }

      for (let v = 0; v < height; v++) {
        for (let u = 0; u < width;) {
          const key = mask[u + v * width];
          if (!key) { u++; continue; }
          let runWidth = 1;
          while (u + runWidth < width && mask[u + runWidth + v * width] === key) runWidth++;
          let runHeight = 1;
          let canGrow = true;
          while (v + runHeight < height && canGrow) {
            for (let k = 0; k < runWidth; k++) {
              if (mask[u + k + (v + runHeight) * width] !== key) {
                canGrow = false;
                break;
              }
            }
            if (canGrow) runHeight++;
          }
          const blockId = key >>> 16;
          const materialId = key & 0xffff;
          emitQuad(
            axis, sign, slice, u, v, runWidth, runHeight,
            blockId, materialId, uAxis, vAxis, normal,
            positions, normals, blockIds, materialIds, uvs
          );
          for (let dv = 0; dv < runHeight; dv++) {
            for (let du = 0; du < runWidth; du++) mask[u + du + (v + dv) * width] = 0;
          }
          u += runWidth;
        }
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Int8Array(normals),
    blockIds: new Uint16Array(blockIds),
    materialIds: new Uint16Array(materialIds),
    uvs: new Float32Array(uvs),
    vertexCount: positions.length / 3,
    quadCount: positions.length / 18
  };
}

function emitQuad(
  axis, sign, slice, u, v, width, height, blockId, materialId,
  uAxis, vAxis, normal, positions, normals, blockIds, materialIds, uvs
) {
  const origin = [0, 0, 0];
  origin[axis] = slice + (sign > 0 ? 1 : 0);
  origin[uAxis] = u;
  origin[vAxis] = v;
  const du = [0, 0, 0], dv = [0, 0, 0];
  du[uAxis] = width;
  dv[vAxis] = height;
  const a = origin;
  const b = origin.map((n, i) => n + du[i]);
  const c = origin.map((n, i) => n + du[i] + dv[i]);
  const d = origin.map((n, i) => n + dv[i]);
  const crossSign = (uAxis === 2 && vAxis === 1) || (uAxis === 0 && vAxis === 2) ? -1 : 1;
  const reverse = crossSign !== sign;
  const vertices = reverse ? [a, d, c, a, c, b] : [a, b, c, a, c, d];
  for (const point of vertices) {
    positions.push(point[0], point[1], point[2]);
    normals.push(normal[0], normal[1], normal[2]);
    blockIds.push(blockId);
    materialIds.push(materialId);
  }
  uvs.push(0, 0, width, 0, width, height, 0, 0, width, height, 0, height);
}
