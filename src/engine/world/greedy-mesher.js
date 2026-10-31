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
 * Builds visible faces and merges adjacent coplanar faces with the same block ID.
 * Returns non-indexed position/normal/blockId/uv buffers ready for WebGL upload.
 * Neighbor lookup is injectable so adjacent chunks can hide shared boundary faces.
 */
export function buildGreedyMesh(chunk, getNeighborBlock = () => 0) {
  const positions = [], normals = [], blockIds = [], uvs = [];
  const dims = [CHUNK_SIZE, chunk.height, CHUNK_SIZE];
  const sample = (x, y, z) => chunk.inBounds(x, y, z)
    ? chunk.get(x, y, z)
    : getNeighborBlock(x, y, z) || 0;

  for (const direction of DIRECTIONS) {
    const { axis, sign, normal } = direction;
    const uAxis = axis === 0 ? 2 : 0;
    const vAxis = axis === 1 ? 2 : 1;
    const width = dims[uAxis], height = dims[vAxis];
    const mask = new Uint16Array(width * height);

    for (let slice = 0; slice < dims[axis]; slice++) {
      mask.fill(0);
      for (let v = 0; v < height; v++) for (let u = 0; u < width; u++) {
        const p = [0, 0, 0]; p[axis] = slice; p[uAxis] = u; p[vAxis] = v;
        const block = sample(...p);
        if (!block) continue;
        const neighbor = [...p]; neighbor[axis] += sign;
        if (!sample(...neighbor)) mask[u + v * width] = block;
      }

      for (let v = 0; v < height; v++) for (let u = 0; u < width;) {
        const block = mask[u + v * width];
        if (!block) { u++; continue; }
        let runWidth = 1;
        while (u + runWidth < width && mask[u + runWidth + v * width] === block) runWidth++;
        let runHeight = 1, canGrow = true;
        while (v + runHeight < height && canGrow) {
          for (let k = 0; k < runWidth; k++) {
            if (mask[u + k + (v + runHeight) * width] !== block) { canGrow = false; break; }
          }
          if (canGrow) runHeight++;
        }
        emitQuad(axis, sign, slice, u, v, runWidth, runHeight, block, uAxis, vAxis,
          normal, positions, normals, blockIds, uvs);
        for (let dv = 0; dv < runHeight; dv++)
          for (let du = 0; du < runWidth; du++) mask[u + du + (v + dv) * width] = 0;
        u += runWidth;
      }
    }
  }

  return {
    positions: new Float32Array(positions),
    normals: new Int8Array(normals),
    blockIds: new Uint16Array(blockIds),
    uvs: new Float32Array(uvs),
    vertexCount: positions.length / 3,
    quadCount: positions.length / 12
  };
}

function emitQuad(axis, sign, slice, u, v, w, h, block, uAxis, vAxis, normal,
  positions, normals, blockIds, uvs) {
  const origin = [0, 0, 0]; origin[axis] = slice + (sign > 0 ? 1 : 0);
  origin[uAxis] = u; origin[vAxis] = v;
  const du = [0, 0, 0], dv = [0, 0, 0];
  du[uAxis] = w; dv[vAxis] = h;
  const a = origin, b = origin.map((n, i) => n + du[i]);
  const c = origin.map((n, i) => n + du[i] + dv[i]);
  const d = origin.map((n, i) => n + dv[i]);
  const vertices = sign > 0 ? [a, b, c, a, c, d] : [a, d, c, a, c, b];
  for (const point of vertices) {
    positions.push(...point); normals.push(...normal); blockIds.push(block);
  }
  uvs.push(0,0, w,0, w,h, 0,0, w,h, 0,h);
}
