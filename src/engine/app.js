import { loadHostedBedrockPack, loadBedrockPackFromFiles, loadTextureOverridesFromZip } from "./assets/bedrock-pack-loader.js";
import { loadLocalPackArchive, saveLocalPackArchive } from "./assets/local-pack-cache.js";
import { FirstPersonController } from "./input/first-person-controller.js";
import { buildTextureAtlas } from "./render/texture-atlas.js";
import { WebGL2Renderer } from "./render/webgl2-renderer.js";
import { createBedrockRegistry } from "./world/bedrock-registry.js";
import { createDemoWorld } from "./world/terrain-generator.js";
import { buildGreedyMesh } from "./world/greedy-mesher.js";

const $ = (id) => document.getElementById(id);
const canvas = $("world-canvas"), loading = $("loading-panel");
const errorPanel = $("error-panel"), status = $("load-status");
const fileInput = $("pack-folder"), archiveInput = $("pack-archive");
const overrideInput = $("texture-overrides"), hud = $("hud");
let renderer = null, controller = null, animationFrame = 0;
let lastFrame = 0, fpsFrames = 0, fpsStarted = performance.now();
let engineStarted = false, currentPack = null, textureOverrides = null;

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

async function startEngine(pack) {
  currentPack = pack;
  if (textureOverrides) pack.getOverrideFile = textureOverrides.getOverrideFile;
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
    const atlas = await buildTextureAtlas(pack, registry, renderer.gl, { maxTextureEdge: 128, padding: 2 });
    renderer.setAtlas(atlas);
    setStatus("Gerando chunks e superfícies visíveis…");
    const world = createDemoWorld(registry, { radius: 2, height: 64, seed: 26060 });
    let totalQuads = 0;
    for (const chunk of world.chunks) {
      const mesh = buildGreedyMesh(chunk, world.getNeighborLookup(chunk), registry.getFaceMaterialId);
      renderer.addChunk(mesh, chunk.x, chunk.z, atlas.rects);
      totalQuads += mesh.quadCount;
    }
    controller = new FirstPersonController(canvas);
    engineStarted = true;
    loading.classList.add("hidden");
    hud.hidden = false;
    $("world-label").textContent = `Bedrock resource pack · ${registry.stats.blockCount} blocos`;
    $("asset-label").textContent = `${atlas.loadedTextures} texturas carregadas${atlas.overriddenTextures ? ` · ${atlas.overriddenTextures} overrides 512px` : ""}${atlas.failedTextures ? ` · ${atlas.failedTextures} falhas` : ""}`;
    $("engine-label").textContent = `WebGL 2 · atlas ${atlas.width}×${atlas.height} · limite GPU ${gpuLimit}`;
    $("mesh-label").textContent = `${world.chunks.length} chunks · ${totalQuads.toLocaleString("pt-BR")} faces após greedy meshing`;
    $("pack-info").textContent = pack.index.source?.game_version
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

fileInput.addEventListener("change", async () => {
  const files = fileInput.files;
  if (!files?.length) return;
  try {
    setStatus(`${files.length.toLocaleString("pt-BR")} arquivos selecionados. Lendo pacote…`);
    await startEngine(await loadBedrockPackFromFiles(files));
  } catch (error) { showError(error); }
});
$("load-default").addEventListener("click", async () => {
  try {
    setStatus("Procurando recursos Bedrock publicados nesta instalação…");
    const pack = await loadHostedBedrockPack();
    if (!pack) throw new Error("Não há pacote Bedrock local no servidor. Use 'Selecionar pasta do pacote'. Os arquivos originais não são enviados ao GitHub.");
    await startEngine(pack);
  } catch (error) { showError(error); }
});
$("open-picker").addEventListener("click", () => fileInput.click());
$("open-archive").addEventListener("click", () => archiveInput.click());
$("open-overrides").addEventListener("click", () => overrideInput.click());
$("hud-open-overrides").addEventListener("click", () => overrideInput.click());
overrideInput.addEventListener("change", async () => {
  if (!overrideInput.files?.length) return;
  try {
    setStatus("Lendo ZIP de texturas 512px local…");
    textureOverrides = await loadTextureOverridesFromZip(overrideInput.files[0]);
    if (currentPack) {
      currentPack.getOverrideFile = textureOverrides.getOverrideFile;
      await startEngine(currentPack);
    } else {
      setStatus(`${textureOverrides.count} texturas 512px indexadas. Agora selecione a pasta Bedrock.`, "success");
    }
  } catch (error) { showError(error); }
});
archiveInput.addEventListener("change", async () => {
  const archive = archiveInput.files?.[0];
  if (!archive) return;
  try {
    setStatus("Lendo e descompactando ZIP local…");
    await startEngine(await loadBedrockPackFromFiles([archive]));
    try {
      await saveLocalPackArchive(archive);
      setStatus("Pacote carregado e salvo neste navegador. Ele abrirá automaticamente nas próximas visitas.", "success");
    } catch (storageError) {
      console.warn("O pacote foi carregado, mas não pôde ser salvo localmente:", storageError);
      setStatus("Pacote carregado. O navegador não permitiu salvá-lo para a próxima visita.", "success");
    }
  } catch (error) { showError(error); }
});
$("back-home").addEventListener("click", () => { window.location.href = "/"; });

(async () => {
  try {
    const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL 2 não foi detectado neste navegador.");
    $("gpu-info").textContent = gl.getParameter(gl.RENDERER) || "GPU WebGL2";
    setStatus("Procurando pacote Bedrock salvo neste navegador…");
    const savedArchive = await loadLocalPackArchive().catch((error) => {
      console.warn("Não foi possível consultar o pacote local salvo:", error);
      return null;
    });
    if (savedArchive) {
      try {
        await startEngine(await loadBedrockPackFromFiles([savedArchive]));
        setStatus("Pacote Bedrock local restaurado automaticamente.", "success");
        return;
      } catch (error) {
        console.warn("O pacote salvo não pôde ser restaurado:", error);
        showError(error);
      }
    }
    setStatus("Aguardando pacote Bedrock local.");
    const hostedPack = await loadHostedBedrockPack();
    if (hostedPack) await startEngine(hostedPack);
  } catch (error) { showError(error); }
})();

window.addEventListener("beforeunload", () => {
  engineStarted = false;
  cancelAnimationFrame(animationFrame);
  controller?.dispose();
  renderer?.dispose();
});
