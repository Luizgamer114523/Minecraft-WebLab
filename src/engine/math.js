/** Small allocation-conscious math primitives for the WebLab renderer. */
export const vec3 = (x = 0, y = 0, z = 0) => new Float32Array([x, y, z]);

export function normalize3(v, out = new Float32Array(3)) {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length > 1e-8) {
    out[0] = v[0] / length; out[1] = v[1] / length; out[2] = v[2] / length;
  } else { out[0] = 0; out[1] = 0; out[2] = 0; }
  return out;
}

export function cross3(a, b, out = new Float32Array(3)) {
  const ax = a[0], ay = a[1], az = a[2];
  const bx = b[0], by = b[1], bz = b[2];
  out[0] = ay * bz - az * by;
  out[1] = az * bx - ax * bz;
  out[2] = ax * by - ay * bx;
  return out;
}

export function mat4Identity(out = new Float32Array(16)) {
  out.fill(0); out[0] = out[5] = out[10] = out[15] = 1; return out;
}

export function mat4Multiply(a, b, out = new Float32Array(16)) {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      result[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  out.set(result); return out;
}

export function mat4Perspective(fovRadians, aspect, near, far, out = new Float32Array(16)) {
  if (!(aspect > 0 && near > 0 && far > near)) throw new RangeError("Invalid perspective parameters");
  const f = 1 / Math.tan(fovRadians / 2);
  out.fill(0);
  out[0] = f / aspect; out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1; out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mat4LookAt(eye, target, up = [0, 1, 0], out = new Float32Array(16)) {
  const z = normalize3([eye[0] - target[0], eye[1] - target[1], eye[2] - target[2]]);
  const x = normalize3(cross3(up, z));
  const y = cross3(z, x);
  out[0] = x[0]; out[1] = y[0]; out[2] = z[0]; out[3] = 0;
  out[4] = x[1]; out[5] = y[1]; out[6] = z[1]; out[7] = 0;
  out[8] = x[2]; out[9] = y[2]; out[10] = z[2]; out[11] = 0;
  out[12] = -(x[0]*eye[0] + x[1]*eye[1] + x[2]*eye[2]);
  out[13] = -(y[0]*eye[0] + y[1]*eye[1] + y[2]*eye[2]);
  out[14] = -(z[0]*eye[0] + z[1]*eye[1] + z[2]*eye[2]);
  out[15] = 1; return out;
}
