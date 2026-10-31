import { loadHostedBedrockPack, loadBedrockPackFromFiles } from "./assets/bedrock-pack-loader.js";
import { createDemoBedrockPack } from "./assets/demo-pack.js";
import { FirstPersonController } from "./input/first-person-controller.js";
import { buildTextureAtlas } from "./render/texture-atlas.js";
import { WebGL2Renderer } from "./render/webgl2-renderer.js";
import { createBedrockRegistry } from "./world/bedrock-registry.js";
import { createProceduralWorld } from "./world/procedural-world.js";
import { buildGreedyMesh } from "./world/greedy-mesher.js";

const $ = (id) => document.getElementById(id);
const canvas = $("world-canvas"), loading = $("loading-panel");
const errorPanel = $("error-panel"), status = $("load-status");
const hud = $("hud");
let renderer = null, controller = null, animationFrame = 0;
let lastFrame = 0, fpsFrames = 0, fpsStarted = performance.now();
let engineStarted = false;
let engineStartQueue = Promise.resolve();

function setStatus(message, kind = "info") {
  status.textContent = message;
  status.dataset.kind = kind;
}
function showError(error) {
  console.error(error);
  errorPanel.textContent = error?.message || String(error);
  errorPanel.hidden = false;
  setStatus("Não foi possível carregar o pacote.", "error");
}
function updateStats(stats, fps) {
  $("stat-fps").textContent = `${fps} FPS`;
  $("stat-chunks").textContent = `${renderer.chunks.length} chunks`;
  $("stat-quads").textContent = `${stats.quads.toLocaleString("pt-BR")} quads`;
  $("stat-draws").textContent = `${stats.drawCalls} draws`;
}

function queueEngineStart(pack) {
  const pending = engineStartQueue.catch(() => {}).then(() => startEngine(pack));
  engineStartQueue = pending.catch(() => {});
  return pending;
}

async function startEngine(pack) {
  if (engineStarted) {
    cancelAnimationFrame(animationFrame);
    controller?.dispose();
    renderer?.dispose();
    controller = null; renderer = null; engineStarted = false;
  }
  errorPanel.hidden = true;
  loading.classList.remove("hidden");
  setStatus("Lendo definições e texturas do pacote…");
  try {
    const probe = canvas.getContext("webgl2");
    if (!probe) throw new Error("Este navegador não oferece WebGL 2. Ative a aceleração de hardware ou use uma versão atual do Chrome.");
    const gpuLimit = probe.getParameter(probe.MAX_TEXTURE_SIZE);
    const registry = createBedrockRegistry(pack.index);
    setStatus(`Preparando atlas: ${registry.stats.materialCount} materiais…`);
    renderer = new WebGL2Renderer(canvas, { maxPixelRatio: 1.5 });
    const atlas = await buildTextureAtlas(pack, registry, renderer.gl, { maxTextureEdge: 64, padding: 1 });
    renderer.setAtlas(atlas);
    setStatus("Gerando biomas, cavernas e chunks próximos…");
    const isTouchDevice = matchMedia("(pointer: coarse)").matches || (navigator.maxTouchPoints || 0) > 0;
    const renderDistance = isTouchDevice ? 2 : 3;
    const world = createProceduralWorld(registry, { height: 96, seed: 26060, seaLevel: 30 });
    const isDemoPack = pack.index.schema === "minecraft-weblab/demo-resource-index@1";
    controller = new FirstPersonController(canvas, {
      getGroundHeight: (x, z) => world.getSurfaceAtWorld(x, z).height,
      eyeHeight: 1.65
    });
    const spawn = world.getSurfaceAtWorld(8, 8);
    controller.position = [8, spawn.height + 13, 8];
    controller.yaw = -Math.PI / 4;
    controller.pitch = -0.42;

    const meshChunk = (chunk) => {
      const mesh = buildGreedyMesh(chunk, world.getNeighborLookup(chunk), registry.getFaceMaterialId);
      renderer.addChunk(mesh, chunk.x, chunk.z, atlas.rects);
    };
    const remeshNeighbors = (chunkX, chunkZ) => {
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const neighbor = world.getChunk(chunkX + dx, chunkZ + dz);
        if (neighbor) meshChunk(neighbor);
      }
    };
    const updateWorldMetrics = () => {
      const totalQuads = renderer.chunks.reduce((sum, chunk) => sum + chunk.quadCount, 0);
      const chunkCount = renderer.chunks.length;
      $("mesh-label").textContent = `${chunkCount} chunks ativos · ${totalQuads.toLocaleString("pt-BR")} faces · streaming procedural`;
      $("world-label").textContent = `${isDemoPack ? "WebLab Demo" : "Bedrock"} · ${registry.stats.blockCount} blocos · ${chunkCount} chunks`;
    };

    const desiredChunkKeys = new Set();
    let pendingChunks = [];
    let lastCenterChunk = "";
    let pruneAfterLoad = false;
    const refreshChunkWindow = () => {
      const centerX = Math.floor(controller.position[0] / 16);
      const centerZ = Math.floor(controller.position[2] / 16);
      const centerKey = `${centerX},${centerZ}`;
      if (centerKey === lastCenterChunk) return;
      lastCenterChunk = centerKey;
      desiredChunkKeys.clear();
      const missing = [];
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        for (let dx = -renderDistance; dx <= renderDistance; dx++) {
          if (dx * dx + dz * dz > renderDistance * renderDistance + 1) continue;
          const chunkX = centerX + dx, chunkZ = centerZ + dz;
          const key = `${chunkX},${chunkZ}`;
          desiredChunkKeys.add(key);
          if (!world.getChunk(chunkX, chunkZ)) missing.push({ x: chunkX, z: chunkZ, distance: dx * dx + dz * dz });
        }
      }
      missing.sort((a, b) => a.distance - b.distance);
      pendingChunks = missing;
      pruneAfterLoad = true;
    };
    const finishChunkWindow = () => {
      if (!pruneAfterLoad || pendingChunks.length) return;
      const removed = [];
      for (const chunk of [...world.chunks.values()]) {
        const key = `${chunk.x},${chunk.z}`;
        if (desiredChunkKeys.has(key)) continue;
        renderer.removeChunk(chunk.x, chunk.z);
        world.unloadChunk(chunk.x, chunk.z);
        removed.push({ x: chunk.x, z: chunk.z });
      }
      for (const chunk of removed) remeshNeighbors(chunk.x, chunk.z);
      pruneAfterLoad = false;
      updateWorldMetrics();
    };

    // Preload the initial view before showing the HUD; only a small mobile-safe window is built.
    refreshChunkWindow();
    for (const item of pendingChunks) world.generateChunk(item.x, item.z);
    const initialChunks = [...world.chunks.values()];
    for (let index = 0; index < initialChunks.length; index++) {
      meshChunk(initialChunks[index]);
      if (index % 3 === 2) await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    pendingChunks = [];
    pruneAfterLoad = false;
    updateWorldMetrics();
    engineStarted = true;
    loading.classList.add("hidden");
    hud.hidden = false;
    $("world-label").textContent = isDemoPack
      ? `WebLab Texture Pack · ${registry.stats.blockCount} blocos`
      : `Bedrock resource pack · ${registry.stats.blockCount} blocos`;
    $("asset-label").textContent = `${atlas.loadedTextures} texturas carregadas${atlas.overriddenTextures ? ` · ${atlas.overriddenTextures} overrides 512px` : ""}${atlas.failedTextures ? ` · ${atlas.failedTextures} falhas` : ""}`;
    $("engine-label").textContent = `WebGL 2 · atlas ${atlas.width}×${atlas.height} · limite GPU ${gpuLimit}`;
    updateWorldMetrics();
    $("pack-info").textContent = isDemoPack
      ? "Pacote de teste com texturas importadas do arquivo fornecido pelo usuário."
      : pack.index.source?.game_version
        ? `Recursos detectados: Minecraft Bedrock ${pack.index.source.game_version}`
        : "Recursos carregados de um pacote Bedrock local";
    const missingRefs = pack.index.stats?.unresolved_texture_references;
    $("quality-note").textContent = `${atlas.failedTextures} textura(s) não decodificada(s) · ${missingRefs ?? "n/d"} referência(s) pendente(s) no índice.`;
    setStatus("Motor iniciado com recursos locais.", "success");
    lastFrame = performance.now(); fpsStarted = lastFrame; fpsFrames = 0;
    const frame = (now) => {
      if (!engineStarted) return;
      const delta = Math.min((now - lastFrame) / 1000, 0.05);
      lastFrame = now;
      controller.update(delta);
      refreshChunkWindow();
      if (!pendingChunks.length) finishChunkWindow();
      if (pendingChunks.length) {
        const nextChunk = pendingChunks.shift();
        const chunk = world.generateChunk(nextChunk.x, nextChunk.z);
        meshChunk(chunk);
        remeshNeighbors(nextChunk.x, nextChunk.z);
        if (!pendingChunks.length) finishChunkWindow();
        updateWorldMetrics();
      }
      const stats = renderer.render(controller);
      fpsFrames++;
      if (now - fpsStarted >= 1000) {
        updateStats(stats, Math.round(fpsFrames * 1000 / (now - fpsStarted)));
        fpsStarted = now; fpsFrames = 0;
      }
      animationFrame = requestAnimationFrame(frame);
    };
    animationFrame = requestAnimationFrame(frame);
  } catch (error) {
    renderer?.dispose(); renderer = null;
    throw error;
  }
}

$("back-home").addEventListener("click", () => { window.location.href = "/"; });

async function authenticatePrivatePack() {
  const check = await fetch("/api/bedrock-auth", {
    credentials: "same-origin",
    cache: "no-store"
  });
  if (!check.ok) throw new Error(`Não foi possível verificar a sessão privada (HTTP ${check.status}).`);
  const session = await check.json();
  if (session.authenticated) return true;

  const password = window.prompt(
    "Pacote Bedrock privado: informe a chave de acesso. Cancele para iniciar o modo de demonstração."
  );
  if (!password) return false;

  const response = await fetch("/api/bedrock-auth", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!response.ok) throw new Error("Chave privada incorreta ou sessão indisponível.");
  return true;
}

(async () => {
  try {
    const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL 2 não foi detectado neste navegador.");
    $("gpu-info").textContent = gl.getParameter(gl.RENDERER) || "GPU WebGL2";
    setStatus("Verificando se há um pacote Bedrock privado hospedado…");
    const packStatusResponse = await fetch("/api/bedrock-assets?status=1", {
      credentials: "same-origin",
      cache: "no-store"
    });
    const packStatus = packStatusResponse.ok
      ? await packStatusResponse.json()
      : { available: false };
    const privateAuthorized = packStatus.available
      ? await authenticatePrivatePack()
      : false;
    const privateResponse = privateAuthorized
      ? await fetch("/api/bedrock-assets", {
          credentials: "same-origin",
          cache: "no-cache"
        })
      : null;
    if (privateResponse?.ok) {
      const privateArchive = await privateResponse.blob();
      const privateFile = new File([privateArchive], "bedrock-assets-prepared.zip", {
        type: "application/zip",
        lastModified: Date.now()
      });
      await queueEngineStart(await loadBedrockPackFromFiles([privateFile]));
      setStatus("Pacote Bedrock privado carregado automaticamente da Vercel.", "success");
      return;
    }
    if (privateResponse && ![401, 404].includes(privateResponse.status)) {
      throw new Error("A Vercel não conseguiu entregar o pacote privado (HTTP " + privateResponse.status + ").");
    }

    setStatus("Pacote privado não configurado. Tentando recursos já hospedados…");
    const hostedPack = await loadHostedBedrockPack();
    if (hostedPack) {
      await queueEngineStart(hostedPack);
      return;
    }

    setStatus("Nenhum pacote Bedrock está hospedado ainda. Iniciando mundo procedural de demonstração…");
    await queueEngineStart(await createDemoBedrockPack());
    setStatus("Mundo procedural ativo com texturas do pacote de teste. Nenhum arquivo precisa ser enviado pelo aparelho.", "success");
  } catch (error) { showError(error); }
})();

window.addEventListener("beforeunload", () => {
  engineStarted = false;
  cancelAnimationFrame(animationFrame);
  controller?.dispose();
  renderer?.dispose();
});
