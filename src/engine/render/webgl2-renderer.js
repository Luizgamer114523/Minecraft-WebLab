import { mat4LookAt, mat4Multiply, mat4Perspective } from "../math.js";

const VERTEX_SHADER = \`#version 300 es
precision highp float;
in vec3 aPosition;
in vec3 aNormal;
in vec2 aLocalUV;
in vec4 aAtlasRect;
uniform mat4 uViewProjection;
uniform vec3 uChunkOffset;
uniform vec3 uCameraPosition;
out vec2 vLocalUV;
out vec4 vAtlasRect;
out float vLight;
out float vFogDistance;
void main() {
  vec3 worldPosition = aPosition + uChunkOffset;
  gl_Position = uViewProjection * vec4(worldPosition, 1.0);
  vLocalUV = aLocalUV;
  vAtlasRect = aAtlasRect;
  float directional = max(dot(normalize(aNormal), normalize(vec3(-0.36, 0.86, 0.34))), 0.0);
  float faceAmbient = aNormal.y > 0.5 ? 1.0 : (aNormal.y < -0.5 ? 0.57 : 0.79);
  vLight = faceAmbient * (0.69 + directional * 0.31);
  vFogDistance = distance(worldPosition, uCameraPosition);
}\`;

const FRAGMENT_SHADER = \`#version 300 es
precision highp float;
uniform sampler2D uAtlas;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
in vec2 vLocalUV;
in vec4 vAtlasRect;
in float vLight;
in float vFogDistance;
out vec4 outColor;
void main() {
  vec2 tiled = fract(vLocalUV);
  vec2 atlasUV = vAtlasRect.xy + tiled * vAtlasRect.zw;
  vec4 texel = texture(uAtlas, atlasUV);
  if (texel.a < 0.48) discard;
  vec3 lit = texel.rgb * vLight;
  float fog = smoothstep(uFogNear, uFogFar, vFogDistance);
  outColor = vec4(mix(lit, uFogColor, fog), 1.0);
}\`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Erro desconhecido no shader";
    gl.deleteShader(shader);
    throw new Error(\`Falha ao compilar shader: \${message}\`);
  }
  return shader;
}
function createProgram(gl) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPosition");
  gl.bindAttribLocation(program, 1, "aNormal");
  gl.bindAttribLocation(program, 2, "aLocalUV");
  gl.bindAttribLocation(program, 3, "aAtlasRect");
  gl.linkProgram(program);
  gl.deleteShader(vertex);
  gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Erro desconhecido ao vincular shaders";
    gl.deleteProgram(program);
    throw new Error(\`Falha ao vincular programa WebGL2: \${message}\`);
  }
  return program;
}

export class WebGL2Renderer {
  constructor(canvas, { resolutionScale = 1, maxPixelRatio = 1.5 } = {}) {
    this.canvas = canvas;
    this.resolutionScale = resolutionScale;
    this.maxPixelRatio = maxPixelRatio;
    this.gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: true,
      powerPreference: "high-performance", preserveDrawingBuffer: false
    });
    if (!this.gl) throw new Error("WebGL 2 não está disponível neste navegador.");
    const gl = this.gl;
    this.program = createProgram(gl);
    this.locations = {
      viewProjection: gl.getUniformLocation(this.program, "uViewProjection"),
      chunkOffset: gl.getUniformLocation(this.program, "uChunkOffset"),
      cameraPosition: gl.getUniformLocation(this.program, "uCameraPosition"),
      atlas: gl.getUniformLocation(this.program, "uAtlas"),
      fogColor: gl.getUniformLocation(this.program, "uFogColor"),
      fogNear: gl.getUniformLocation(this.program, "uFogNear"),
      fogFar: gl.getUniformLocation(this.program, "uFogFar")
    };
    this.chunks = [];
    this.texture = gl.createTexture();
    this.projection = new Float32Array(16);
    this.view = new Float32Array(16);
    this.viewProjection = new Float32Array(16);
    this.frameStats = { drawCalls: 0, vertices: 0, quads: 0 };
    this.fogColor = [0.54, 0.70, 0.80];
    gl.enable(gl.DEPTH_TEST);
    gl.depthFunc(gl.LEQUAL);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    gl.frontFace(gl.CCW);
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.uniform1i(this.locations.atlas, 0);
    this.resizeObserver = typeof ResizeObserver === "function"
      ? new ResizeObserver(() => this.resize()) : null;
    this.resizeObserver?.observe(canvas);
    this.resize();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.maxPixelRatio) * this.resolutionScale;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    mat4Perspective(72 * Math.PI / 180, width / height, 0.08, 240, this.projection);
  }

  setAtlas(atlas) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, atlas.canvas);
    this.atlasSize = { width: atlas.width, height: atlas.height };
  }

  addChunk(mesh, chunkX, chunkZ, atlasRects) {
    const gl = this.gl, vertexCount = mesh.vertexCount, stride = 12;
    const interleaved = new Float32Array(vertexCount * stride);
    for (let vertex = 0; vertex < vertexCount; vertex++) {
      const p = vertex * 3, uv = vertex * 2, out = vertex * stride;
      interleaved[out] = mesh.positions[p];
      interleaved[out + 1] = mesh.positions[p + 1];
      interleaved[out + 2] = mesh.positions[p + 2];
      interleaved[out + 3] = mesh.normals[p];
      interleaved[out + 4] = mesh.normals[p + 1];
      interleaved[out + 5] = mesh.normals[p + 2];
      interleaved[out + 6] = mesh.uvs[uv];
      interleaved[out + 7] = mesh.uvs[uv + 1];
      const rectOffset = mesh.materialIds[vertex] * 4;
      interleaved[out + 8] = atlasRects[rectOffset] ?? 0;
      interleaved[out + 9] = atlasRects[rectOffset + 1] ?? 0;
      interleaved[out + 10] = atlasRects[rectOffset + 2] ?? 1;
      interleaved[out + 11] = atlasRects[rectOffset + 3] ?? 1;
    }
    const vao = gl.createVertexArray(), buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, interleaved, gl.STATIC_DRAW);
    const strideBytes = stride * 4;
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, strideBytes, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, strideBytes, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, strideBytes, 24);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, strideBytes, 32);
    gl.bindVertexArray(null);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.chunks.push({ vao, buffer, vertexCount, quadCount: mesh.quadCount, offset: [chunkX * 16, 0, chunkZ * 16] });
  }

  render(camera) {
    const gl = this.gl;
    this.resize();
    const forward = [
      Math.sin(camera.yaw) * Math.cos(camera.pitch),
      Math.sin(camera.pitch),
      -Math.cos(camera.yaw) * Math.cos(camera.pitch)
    ];
    const target = [
      camera.position[0] + forward[0],
      camera.position[1] + forward[1],
      camera.position[2] + forward[2]
    ];
    mat4LookAt(camera.position, target, [0, 1, 0], this.view);
    mat4Multiply(this.projection, this.view, this.viewProjection);
    gl.clearColor(this.fogColor[0], this.fogColor[1], this.fogColor[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.uniformMatrix4fv(this.locations.viewProjection, false, this.viewProjection);
    gl.uniform3fv(this.locations.cameraPosition, camera.position);
    gl.uniform3fv(this.locations.fogColor, this.fogColor);
    gl.uniform1f(this.locations.fogNear, 55);
    gl.uniform1f(this.locations.fogFar, 118);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    let drawCalls = 0, vertices = 0, quads = 0;
    for (const chunk of this.chunks) {
      gl.uniform3fv(this.locations.chunkOffset, chunk.offset);
      gl.bindVertexArray(chunk.vao);
      gl.drawArrays(gl.TRIANGLES, 0, chunk.vertexCount);
      drawCalls++;
      vertices += chunk.vertexCount;
      quads += chunk.quadCount;
    }
    gl.bindVertexArray(null);
    this.frameStats = { drawCalls, vertices, quads };
    return this.frameStats;
  }

  dispose() {
    const gl = this.gl;
    for (const chunk of this.chunks) {
      gl.deleteBuffer(chunk.buffer);
      gl.deleteVertexArray(chunk.vao);
    }
    this.chunks.length = 0;
    gl.deleteTexture(this.texture);
    gl.deleteProgram(this.program);
    this.resizeObserver?.disconnect();
  }
}
