import './style.css'

const app = document.querySelector('#app')
app.innerHTML = `
<div class="shell">
  <aside class="sidebar">
    <a class="brand" href="#"><span class="brand-mark">S</span><span><b>SENTINELA</b><small>AI · CAMERA SECURITY</small></span></a>
    <div class="nav-label">WORKSPACE</div>
    <button class="nav active"><span>▦</span> Visão geral</button>
    <button class="nav" id="eventsNav"><span>◷</span> Eventos <i id="eventCount">0</i></button>
    <button class="nav" id="sourcesNav"><span>◎</span> Fontes de vídeo</button>
    <div class="side-bottom"><div class="connection-dot"></div><span>Motor local ativo</span><small>v0.1.0 · protótipo</small></div>
  </aside>
  <main class="main">
    <header class="topbar"><div><div class="eyebrow">CENTRAL DE MONITORAMENTO</div><h1>Visão geral</h1></div><div class="top-actions"><span class="demo-pill"><i></i> MODO DE TESTE</span><div class="avatar">L</div></div></header>
    <section class="welcome"><div><div class="eyebrow">SISTEMA SENTINELA</div><h2>Seu ambiente, <em>sob vigilância.</em></h2><p>Analise uma fonte de vídeo, detecte movimento e registre ocorrências em tempo real.</p></div><div class="welcome-icon">⌁</div></section>
    <section class="stats">
      <article class="stat"><span>FONTES CONECTADAS</span><strong id="sourceStat">0 <small>/ 1</small></strong><div class="stat-foot"><i class="muted-dot"></i> Aguardando fonte</div></article>
      <article class="stat"><span>EVENTOS DETECTADOS</span><strong id="eventsStat">0</strong><div class="stat-foot"><i class="green-dot"></i> Nesta sessão</div></article>
      <article class="stat"><span>ANÁLISE</span><strong id="analysisStat">Inativa</strong><div class="stat-foot">Processamento no navegador</div></article>
    </section>
    <section class="content-grid">
      <article class="panel video-panel">
        <div class="panel-head"><div><span class="eyebrow">MONITOR PRINCIPAL</span><h3>Visualização da câmera</h3></div><span class="live-state" id="liveState"><i></i> SEM SINAL</span></div>
        <div class="video-stage" id="stage">
          <div class="empty-state" id="emptyState"><div class="camera-icon">▣</div><h3>Nenhuma fonte selecionada</h3><p>Envie um vídeo gravado ou use uma câmera disponível neste dispositivo para iniciar a análise.</p><label class="primary-btn" for="videoInput">＋ Adicionar vídeo</label><input id="videoInput" type="file" accept="video/*" hidden /><button class="secondary-btn" id="webcamBtn">Usar câmera deste dispositivo</button></div>
          <video id="video" playsinline controls hidden></video>
          <canvas id="overlay" hidden></canvas>
          <div class="scan-tag" id="scanTag" hidden>ANÁLISE ATIVA</div>
        </div>
        <div class="video-foot"><span id="sourceName">Nenhuma fonte conectada</span><button id="stopBtn" class="text-btn" disabled>Parar análise</button></div>
      </article>
      <article class="panel event-panel" id="eventsPanel">
        <div class="panel-head"><div><span class="eyebrow">ATIVIDADE</span><h3>Eventos recentes</h3></div><span class="counter" id="eventBadge">0</span></div>
        <div class="event-list" id="eventList"><div class="no-events"><span>◷</span><b>Nenhum evento ainda</b><p>Movimentos detectados aparecerão aqui.</p></div></div>
        <div class="panel-note">Os eventos desta versão ficam apenas nesta sessão do navegador.</div>
      </article>
    </section>
    <section class="panel setup-panel" id="sourcesPanel"><div><span class="eyebrow">PRÓXIMA ETAPA</span><h3>Conectar sua câmera Wi-Fi</h3><p>Esta versão já analisa vídeos enviados e câmeras locais do navegador. A conexão direta com a câmera V360 Pro ainda precisa da integração com o protocolo do fabricante ou de uma ponte local.</p></div><div class="setup-status"><span class="status-pending"></span><b>Integração V360</b><small>Em desenvolvimento</small></div></section>
    <footer> SENTINELA AI <span>·</span> Privacidade primeiro. A análise de vídeo acontece localmente nesta página.</footer>
  </main>
</div>`

const video = document.querySelector('#video')
const canvas = document.querySelector('#overlay')
const ctx = canvas.getContext('2d', { willReadFrequently: true })
const input = document.querySelector('#videoInput')
const empty = document.querySelector('#emptyState')
const stage = document.querySelector('#stage')
let stream = null, timer = null, previous = null, lastEvent = 0, eventTotal = 0, running = false

function setSource(name) {
  empty.hidden = true; video.hidden = false; canvas.hidden = false
  document.querySelector('#sourceName').textContent = name
  document.querySelector('#liveState').innerHTML = '<i></i> CONECTADO'
  document.querySelector('#liveState').classList.add('on')
  document.querySelector('#sourceStat').innerHTML = '1 <small>/ 1</small>'
  document.querySelector('#stopBtn').disabled = false
  document.querySelector('#analysisStat').textContent = 'Ativa'
  document.querySelector('#scanTag').hidden = false
  running = true
  startAnalysis()
}
function stop() {
  clearInterval(timer); timer = null; running = false; previous = null
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null }
  video.pause(); video.srcObject = null
  video.hidden = true; canvas.hidden = true; empty.hidden = false
  document.querySelector('#liveState').innerHTML = '<i></i> SEM SINAL'
  document.querySelector('#liveState').classList.remove('on')
  document.querySelector('#sourceStat').innerHTML = '0 <small>/ 1</small>'
  document.querySelector('#analysisStat').textContent = 'Inativa'
  document.querySelector('#scanTag').hidden = true
  document.querySelector('#stopBtn').disabled = true
  document.querySelector('#sourceName').textContent = 'Nenhuma fonte conectada'
}
function startAnalysis() {
  clearInterval(timer)
  timer = setInterval(() => {
    if (!running || video.readyState < 2 || video.videoWidth === 0) return
    const w = 320, h = Math.round(w * video.videoHeight / video.videoWidth)
    canvas.width = w; canvas.height = h
    ctx.drawImage(video, 0, 0, w, h)
    const frame = ctx.getImageData(0, 0, w, h)
    const data = frame.data
    let changed = 0
    if (previous) {
      for (let i = 0; i < data.length; i += 16) {
        const diff = Math.abs(data[i] - previous[i]) + Math.abs(data[i+1] - previous[i+1]) + Math.abs(data[i+2] - previous[i+2])
        if (diff > 85) changed++
      }
    }
    previous = new Uint8ClampedArray(data)
    const ratio = changed / (data.length / 16)
    if (ratio > 0.13 && Date.now() - lastEvent > 4500) {
      lastEvent = Date.now(); addEvent(Math.round(ratio * 100))
    }
    document.querySelector('#scanTag').textContent = ratio > 0.13 ? 'MOVIMENTO DETECTADO' : 'ANÁLISE ATIVA'
    document.querySelector('#scanTag').classList.toggle('alert', ratio > 0.13)
  }, 650)
}
function addEvent(intensity) {
  eventTotal++
  document.querySelector('#eventsStat').textContent = eventTotal
  document.querySelector('#eventCount').textContent = eventTotal
  document.querySelector('#eventBadge').textContent = eventTotal
  const list = document.querySelector('#eventList')
  if (eventTotal === 1) list.innerHTML = ''
  const item = document.createElement('div')
  item.className = 'event-item'
  const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  item.innerHTML = '<span class="event-symbol">⌁</span><div><b>Movimento detectado</b><small>' + time + ' · intensidade ' + intensity + '%</small></div><span class="event-new">NOVO</span>'
  list.prepend(item)
}
input.addEventListener('change', () => {
  const file = input.files?.[0]; if (!file) return
  stop(); video.srcObject = null; video.src = URL.createObjectURL(file)
  video.onloadedmetadata = () => { video.play().catch(() => {}); setSource(file.name) }
})
document.querySelector('#webcamBtn').addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    stop(); stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
    video.src = ''; video.srcObject = stream
    video.onloadedmetadata = () => { video.play(); setSource('Câmera deste dispositivo') }
  } catch (e) { alert('Não foi possível acessar a câmera. Verifique a permissão do navegador e use HTTPS.') }
})
document.querySelector('#stopBtn').addEventListener('click', stop)
document.querySelector('#eventsNav').addEventListener('click', () => document.querySelector('#eventsPanel').scrollIntoView({behavior:'smooth'}))
document.querySelector('#sourcesNav').addEventListener('click', () => document.querySelector('#sourcesPanel').scrollIntoView({behavior:'smooth'}))


// Sentinela Bridge: local network video input. For LAN access, open this build from
// the local bridge origin (http://127.0.0.1:8787), not the public Vercel origin.
const sbSection = document.createElement('section');
sbSection.className = 'panel bridge-panel';
sbSection.id = 'sentinelaBridgePanel';
sbSection.innerHTML = '<div class="bridge-header"><div><span class="eyebrow">PONTE LOCAL · V360 / RTSP</span><h3>Conectar câmera Wi-Fi</h3><p>O painel hospedado na Vercel não consegue abrir diretamente uma conexão privada da sua LAN. Para vídeo local, inicie a ponte e abra esta interface em <code>http://127.0.0.1:8787</code>.</p></div><span class="bridge-badge" id="sbBridgeBadge">OFFLINE</span></div><div class="bridge-form"><label for="sbCameraHost">IP local da câmera</label><div class="bridge-row"><input id="sbCameraHost" value="192.168.0.2" autocomplete="off" spellcheck="false"><button id="sbProbe" class="secondary-btn">Testar rede</button></div><label for="sbSourceUrl">URL RTSP / HTTP da transmissão</label><div class="bridge-row"><input id="sbSourceUrl" placeholder="rtsp://192.168.0.2:554/caminho-da-stream" autocomplete="off" spellcheck="false"><button id="sbConnect" class="primary-btn">Conectar</button></div><div class="bridge-result" id="sbResult">Verificando a ponte local...</div></div><div class="bridge-video-wrap" id="sbVideoWrap" hidden><img id="sbBridgeVideo" alt="Transmissão da câmera"><span class="bridge-live-tag">● LIVE · PONTE LOCAL</span></div><div class="bridge-foot">A ponte verifica portas TCP comuns e aceita RTSP/HTTP. Ela não quebra nem contorna a autenticação P2P do fabricante.</div>';
document.querySelector('.main').appendChild(sbSection);

const sb = (id) => document.getElementById(id);
let sbOnline = false;
let sbSeenEvents = new Set();
let sbBridgeActive = false;

async function sbApi(path, options) {
  const response = await fetch(path, { ...options, headers: { 'Content-Type': 'application/json', ...(options && options.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || ('HTTP ' + response.status));
  return data;
}
function sbSetOnline(value) {
  sbOnline = value;
  sb('sbBridgeBadge').textContent = value ? 'PONTE ONLINE' : 'OFFLINE';
  sb('sbBridgeBadge').classList.toggle('online', value);
}
function sbAddEvent(event) {
  const list = document.getElementById('eventList');
  if (!list) return;
  const empty = list.querySelector('.no-events');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = 'event-item';
  const symbol = document.createElement('span');
  symbol.className = 'event-symbol'; symbol.textContent = '⌁';
  const info = document.createElement('div');
  const title = document.createElement('b'); title.textContent = event.title || 'Movimento detectado';
  const detail = document.createElement('small');
  detail.textContent = new Date((event.timestamp || Date.now() / 1000) * 1000).toLocaleTimeString('pt-BR') + ' · ' + (event.detail || 'análise local');
  info.append(title, detail);
  const tag = document.createElement('span'); tag.className = 'event-new'; tag.textContent = 'NOVO';
  item.append(symbol, info, tag); list.prepend(item);
  const count = list.querySelectorAll('.event-item').length;
  const counter = document.getElementById('eventBadge'); if (counter) counter.textContent = String(count);
  const total = document.getElementById('eventsStat'); if (total) total.textContent = String(count);
  const navCount = document.getElementById('eventCount'); if (navCount) navCount.textContent = String(count);
}
async function sbRefreshEvents() {
  if (!sbOnline) return;
  try {
    const data = await sbApi('/api/events');
    for (const event of data.events || []) {
      const key = String(event.id || event.timestamp);
      if (!sbSeenEvents.has(key)) { sbSeenEvents.add(key); sbAddEvent(event); }
    }
  } catch {}
}
async function sbCheckBridge() {
  try {
    const status = await sbApi('/api/status');
    sbSetOnline(true);
    sb('sbResult').textContent = status.running ? 'Transmissão local detectada.' : 'Ponte conectada. Faça o diagnóstico ou informe uma URL de stream compatível.';
    if (status.running && !sbBridgeActive) {
      sbBridgeActive = true;
      sb('sbVideoWrap').hidden = false;
      sb('sbBridgeVideo').src = '/stream.mjpg?ts=' + Date.now();
      sb('sbBridgeBadge').textContent = 'TRANSMITINDO';
      const hint = document.getElementById('sourceName'); if (hint) hint.textContent = status.sourceLabel || 'Fonte da ponte local';
      const empty = document.getElementById('emptyState'); if (empty) empty.hidden = true;
      const video = document.getElementById('video'); if (video) video.hidden = true;
      const live = document.getElementById('liveState'); if (live) { live.innerHTML = '<i></i> CONECTADO'; live.classList.add('on'); }
      const sourceStat = document.getElementById('sourceStat'); if (sourceStat) sourceStat.innerHTML = '1 <small>/ 1</small>';
      const analysis = document.getElementById('analysisStat'); if (analysis) analysis.textContent = 'Ativa';
    }
    if (!status.running && sbBridgeActive) {
      sbBridgeActive = false; sb('sbVideoWrap').hidden = true;
    }
  } catch {
    sbSetOnline(false);
    sb('sbResult').textContent = 'Ponte local não encontrada. Clone o repositório, gere o build e inicie bridge/server.py; depois abra http://127.0.0.1:8787.';
  }
}
sb('sbProbe').addEventListener('click', async () => {
  if (!sbOnline) { sb('sbResult').textContent = 'Abra esta interface pelo servidor local para testar a rede da câmera.'; return; }
  sb('sbProbe').disabled = true; sb('sbResult').textContent = 'Verificando portas comuns...';
  try {
    const result = await sbApi('/api/probe?host=' + encodeURIComponent(sb('sbCameraHost').value.trim()));
    sb('sbResult').textContent = result.summary;
  } catch (error) { sb('sbResult').textContent = error.message; }
  finally { sb('sbProbe').disabled = false; }
});
sb('sbConnect').addEventListener('click', async () => {
  if (!sbOnline) { sb('sbResult').textContent = 'A Vercel não alcança a LAN. Inicie a ponte e abra http://127.0.0.1:8787.'; return; }
  const source = sb('sbSourceUrl').value.trim();
  if (!source) { sb('sbResult').textContent = 'Informe uma URL RTSP/HTTP válida. O caminho exato depende do firmware.'; return; }
  sb('sbConnect').disabled = true; sb('sbResult').textContent = 'Abrindo transmissão...';
  try {
    const result = await sbApi('/api/source/start', { method: 'POST', body: JSON.stringify({ source }) });
    sbBridgeActive = true; sb('sbVideoWrap').hidden = false;
    sb('sbBridgeVideo').src = '/stream.mjpg?ts=' + Date.now();
    const hint = document.getElementById('sourceName'); if (hint) hint.textContent = result.sourceLabel || 'Fonte da ponte local';
    const empty = document.getElementById('emptyState'); if (empty) empty.hidden = true;
    const video = document.getElementById('video'); if (video) video.hidden = true;
    const live = document.getElementById('liveState'); if (live) { live.innerHTML = '<i></i> CONECTADO'; live.classList.add('on'); }
    const sourceStat = document.getElementById('sourceStat'); if (sourceStat) sourceStat.innerHTML = '1 <small>/ 1</small>';
    const analysis = document.getElementById('analysisStat'); if (analysis) analysis.textContent = 'Ativa';
    sb('sbBridgeBadge').textContent = 'TRANSMITINDO';
    sb('sbResult').textContent = 'Fonte conectada. A detecção de movimento está rodando localmente.';
    sbRefreshEvents();
  } catch (error) { sb('sbResult').textContent = 'Falha: ' + error.message; }
  finally { sb('sbConnect').disabled = false; }
});
const sbStop = document.getElementById('stopBtn');
if (sbStop) sbStop.addEventListener('click', async () => {
  if (sbOnline && sbBridgeActive) {
    try { await sbApi('/api/source/stop', { method: 'POST', body: '{}' }); } catch {}
    sbBridgeActive = false; sb('sbVideoWrap').hidden = true; sb('sbBridgeVideo').removeAttribute('src');
    const live = document.getElementById('liveState'); if (live) { live.innerHTML = '<i></i> SEM SINAL'; live.classList.remove('on'); }
    const sourceStat = document.getElementById('sourceStat'); if (sourceStat) sourceStat.innerHTML = '0 <small>/ 1</small>';
    const analysis = document.getElementById('analysisStat'); if (analysis) analysis.textContent = 'Inativa';
  }
});
sbCheckBridge();
setInterval(sbCheckBridge, 8000);
setInterval(sbRefreshEvents, 2500);
