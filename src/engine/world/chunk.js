export const CHUNK_SIZE = 16;
export const DEFAULT_WORLD_HEIGHT = 128;

/**
 * Compact voxel storage. Zero is always air; non-zero values are block IDs.
 * Layout is X-fastest, then Z, then Y for contiguous horizontal scans.
 */
export class Chunk {
  constructor({ x = 0, z = 0, height = DEFAULT_WORLD_HEIGHT, data } = {}) {
    if (!Number.isInteger(height) || height < 1 || height > 1024) {
      throw new RangeError("Chunk height must be an integer from 1 to 1024");
    }
    this.x = x;
    this.z = z;
    this.height = height;
    const volume = CHUNK_SIZE * CHUNK_SIZE * height;
    this.blocks = data ? new Uint16Array(data) : new Uint16Array(volume);
    if (this.blocks.length !== volume) throw new RangeError("Chunk data has an invalid length");
    this.revision = 0;
  }

  index(x, y, z) {
    return x + CHUNK_SIZE * (z + CHUNK_SIZE * y);
  }

  inBounds(x, y, z) {
    return x >= 0 && x < CHUNK_SIZE && z >= 0 && z < CHUNK_SIZE && y >= 0 && y < this.height;
  }

  get(x, y, z) {
    if (!this.inBounds(x, y, z)) return 0;
    return this.blocks[this.index(x, y, z)];
  }

  set(x, y, z, blockId) {
    if (!this.inBounds(x, y, z)) throw new RangeError("Voxel coordinate is outside this chunk");
    if (!Number.isInteger(blockId) || blockId < 0 || blockId > 65535) {
      throw new RangeError("Block ID must be an unsigned 16-bit integer");
    }
    const index = this.index(x, y, z);
    if (this.blocks[index] === blockId) return false;
    this.blocks[index] = blockId;
    this.revision++;
    return true;
  }

  fillLayer(y, blockId) {
    if (y < 0 || y >= this.height) throw new RangeError("Layer outside chunk");
    const start = this.index(0, y, 0);
    this.blocks.fill(blockId, start, start + CHUNK_SIZE * CHUNK_SIZE);
    this.revision++;
  }
}
