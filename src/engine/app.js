import { loadHostedBedrockPack, loadBedrockPackFromFiles, loadTextureOverridesFromZip } from "./assets/bedrock-pack-loader.js";
import { createDemoBedrockPack } from "./assets/demo-pack.js";
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
    const atlas = await buildTextureAtlas(pack, registry, renderer.gl, { maxTextureEdge: 64, padding: 1 });
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
    const isDemoPack = pack.index.schema === "minecraft-weblab/demo-resource-index@1";
    $("world-label").textContent = isDemoPack
      ? `WebLab Demo Pack · ${registry.stats.blockCount} blocos`
      : `Bedrock resource pack · ${registry.stats.blockCount} blocos`;
    $("asset-label").textContent = `${atlas.loadedTextures} texturas carregadas${atlas.overriddenTextures ? ` · ${atlas.overriddenTextures} overrides 512px` : ""}${atlas.failedTextures ? ` · ${atlas.failedTextures} falhas` : ""}`;
    $("engine-label").textContent = `WebGL 2 · atlas ${atlas.width}×${atlas.height} · limite GPU ${gpuLimit}`;
    $("mesh-label").textContent = `${world.chunks.length} chunks · ${totalQuads.toLocaleString("pt-BR")} faces após greedy meshing`;
    $("pack-info").textContent = isDemoPack
      ? "Pacote de teste gerado pelo WebLab. Não contém arquivos originais do Minecraft."
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
    await queueEngineStart(await loadBedrockPackFromFiles(files));
  } catch (error) { showError(error); }
});
$("load-default").addEventListener("click", async () => {
  try {
    setStatus("Procurando recursos Bedrock publicados nesta instalação…");
    const pack = await loadHostedBedrockPack();
    if (!pack) throw new Error("Não há pacote Bedrock local no servidor. Use 'Selecionar pasta do pacote'. Os arquivos originais não são enviados ao GitHub.");
    await queueEngineStart(pack);
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
      await queueEngineStart(currentPack);
    } else {
      setStatus(`${textureOverrides.count} texturas 512px indexadas. Agora selecione a pasta Bedrock.`, "success");
    }
  } catch (error) { showError(error); }
});
async function ensurePrivateAssetSession() {
  const current = await fetch("/api/bedrock-auth", { credentials: "same-origin", cache: "no-store" });
  if (current.ok) {
    const state = await current.json();
    if (state.authenticated) return;
  }

  const password = window.prompt("Configuração única do WebLab: cole a chave privada fornecida nesta conversa.");
  if (!password) throw new Error("Configuração cancelada. O pacote privado não foi alterado.");

  const login = await fetch("/api/bedrock-auth", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password })
  });
  if (!login.ok) throw new Error(login.status === 401
    ? "Chave privada incorreta. Confira a chave e tente novamente."
    : "Não foi possível autenticar no armazenamento privado.");
}

async function uploadPrivateBedrockPack(archive) {
  const form = new FormData();
  form.append("file", archive, "bedrock-assets-prepared.zip");
  const response = await fetch("/api/bedrock-assets", {
    method: "POST",
    credentials: "same-origin",
    body: form
  });
  if (!response.ok) {
    const detail = await response.json().catch(() => ({}));
    throw new Error(detail.error || "Não foi possível guardar o pacote na Vercel Blob privada.");
  }
  return response.json();
}

archiveInput.addEventListener("change", async () => {
  const archive = archiveInput.files?.[0];
  if (!archive) return;
  try {
    if (!/\.zip$/i.test(archive.name)) throw new Error("Selecione o arquivo ZIP preparado do WebLab.");
    setStatus("Autenticando o armazenamento privado…");
    await ensurePrivateAssetSession();
    setStatus("Enviando o pacote uma única vez para a Vercel Blob privada…");
    const saved = await uploadPrivateBedrockPack(archive);
    setStatus("Pacote privado guardado na Vercel. Preparando a primeira cena…", "success");
    await queueEngineStart(await loadBedrockPackFromFiles([archive]));
    setStatus("Pacote configurado. Nas próximas visitas, ele será carregado automaticamente.", "success");
    console.info("Private Bedrock assets stored:", saved.size, "bytes");
  } catch (error) { showError(error); }
});
$("back-home").addEventListener("click", () => { window.location.href = "/"; });

(async () => {
  try {
    const gl = canvas.getContext("webgl2", { antialias: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL 2 não foi detectado neste navegador.");
    $("gpu-info").textContent = gl.getParameter(gl.RENDERER) || "GPU WebGL2";
    setStatus("Buscando o pacote Bedrock privado na Vercel…");
    const privateResponse = await fetch("/api/bedrock-assets", {
      credentials: "same-origin",
      cache: "no-cache"
    });
    if (privateResponse.ok) {
      const privateArchive = await privateResponse.blob();
      const privateFile = new File([privateArchive], "bedrock-assets-prepared.zip", {
        type: "application/zip",
        lastModified: Date.now()
      });
      await queueEngineStart(await loadBedrockPackFromFiles([privateFile]));
      setStatus("Pacote Bedrock privado carregado automaticamente da Vercel.", "success");
      return;
    }
    if (![401, 404].includes(privateResponse.status)) {
      throw new Error("A Vercel não conseguiu entregar o pacote privado (HTTP " + privateResponse.status + ").");
    }

    setStatus("Pacote privado ainda não configurado. A importação inicial será feita uma única vez.");
    const savedArchive = await loadLocalPackArchive().catch((error) => {
      console.warn("Não foi possível consultar o pacote local salvo:", error);
      return null;
    });
    if (savedArchive) {
      try {
        await queueEngineStart(await loadBedrockPackFromFiles([savedArchive]));
        setStatus("Pacote local restaurado. Configure a cópia privada na Vercel para uso automático em outros aparelhos.", "success");
        return;
      } catch (error) {
        console.warn("O pacote salvo não pôde ser restaurado:", error);
        showError(error);
      }
    }
    const hostedPack = await loadHostedBedrockPack();
    if (hostedPack) {
      await queueEngineStart(hostedPack);
      return;
    }

    setStatus("Nenhum pacote privado foi configurado. Iniciando modo de demonstração leve…");
    await queueEngineStart(await createDemoBedrockPack());
    setStatus("Modo de demonstração ativo. O teste funciona sem importar arquivos no celular.", "success");
  } catch (error) { showError(error); }
})();

window.addEventListener("beforeunload", () => {
  engineStarted = false;
  cancelAnimationFrame(animationFrame);
  controller?.dispose();
  renderer?.dispose();
});
