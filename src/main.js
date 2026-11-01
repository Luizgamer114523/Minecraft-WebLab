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



// Direct V360 PPCS session. Credentials are kept in memory only and never stored.
const ppcsPanel = document.createElement('section');
ppcsPanel.className = 'panel ppcs-panel';
ppcsPanel.id = 'ppcsPanel';
ppcsPanel.innerHTML = `
  <div class="ppcs-head">
    <div><span class="eyebrow">CONEXÃO NATIVA · PPCS / V360 PRO</span><h3>Conectar câmera Wi-Fi</h3>
      <p>Usa a biblioteca PPCS extraída do APK V360 Pro no próprio Android. A sessão é autenticada com os dados da sua câmera.</p></div>
    <span class="ppcs-state" id="ppcsState"><i></i> VERIFICANDO PONTE</span>
  </div>
  <div class="ppcs-form">
    <label for="ppcsDid">DID / ID da câmera</label>
    <input id="ppcsDid" placeholder="Ex.: ID exibido nos detalhes do dispositivo" autocomplete="off" spellcheck="false">
    <div class="ppcs-two">
      <div><label for="ppcsPassword">Senha do dispositivo</label><input id="ppcsPassword" type="password" placeholder="Senha configurada no V360 Pro" autocomplete="off"></div>
      <div><label for="ppcsType">Tipo do dispositivo</label><input id="ppcsType" value="43" inputmode="numeric" autocomplete="off"></div>
    </div>
    <p class="ppcs-hint">O tipo 43 é apenas a referência do projeto de compatibilidade. O tipo da sua câmera ainda precisa ser confirmado; pode ser necessário ajustar este campo.</p>
    <div class="ppcs-actions"><button class="primary-btn" id="ppcsConnect">Conectar e iniciar vídeo</button><button class="secondary-btn" id="ppcsStop" disabled>Encerrar sessão</button></div>
    <div class="ppcs-result" id="ppcsResult">Abra o app “Sentinela AI PPCS Bridge” no Android e carregue o APK V360 Pro para habilitar o transporte local.</div>
  </div>
  <div class="ppcs-stream" id="ppcsStreamBox" hidden><div class="ppcs-stream-head"><span>TRANSMISSÃO PPCS</span><span id="ppcsStreamMeta"></span></div><img id="ppcsStream" alt="Transmissão ao vivo da câmera"></div>
  <div class="ppcs-foot">O vídeo passa pela sessão local do Android. Esta conexão não envia a imagem para a Vercel. A câmera precisa concluir a negociação PPCS inicial com a internet disponível.</div>
`;
document.querySelector('.main').insertBefore(ppcsPanel, document.querySelector('.main footer'));

let ppcsSession = null;
let ppcsBridgeOnline = false;
let ppcsMotionPrevious = null;
let ppcsMotionAt = 0;
let ppcsEventTotal = 0;

async function ppcsRequest(path, body) {
  const response = await fetch(path, body ? {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  } : {});
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error || ('HTTP ' + response.status));
  return data;
}
function ppcsSetState(text, online) {
  const state = document.getElementById('ppcsState');
  state.textContent = text;
  state.classList.toggle('online', !!online);
  ppcsBridgeOnline = !!online;
}
function ppcsAppendEvent(title, detail) {
  const list = document.getElementById('eventList');
  if (!list) return;
  const empty = list.querySelector('.no-events');
  if (empty) empty.remove();
  const item = document.createElement('div');
  item.className = 'event-item';
  const mark = document.createElement('span');
  mark.className = 'event-symbol'; mark.textContent = '⌁';
  const info = document.createElement('div');
  const name = document.createElement('b'); name.textContent = title;
  const desc = document.createElement('small');
  desc.textContent = new Date().toLocaleTimeString('pt-BR') + ' · ' + detail;
  info.append(name, desc);
  const tag = document.createElement('span'); tag.className = 'event-new'; tag.textContent = 'NOVO';
  item.append(mark, info, tag); list.prepend(item);
  ppcsEventTotal++;
  for (const id of ['eventsStat','eventCount','eventBadge']) {
    const node = document.getElementById(id); if (node) node.textContent = String(ppcsEventTotal);
  }
}
async function ppcsCheckBridge() {
  try {
    const status = await ppcsRequest('/api/bridge/status');
    ppcsSetState('PPCS ' + (status.version ?? 'ONLINE'), true);
    document.getElementById('ppcsResult').textContent = 'Ponte Android encontrada. Preencha o DID e a senha para iniciar a sessão autenticada.';
  } catch (error) {
    ppcsSetState('PONTE OFFLINE', false);
    document.getElementById('ppcsResult').textContent = 'Ponte não encontrada em 127.0.0.1:8766. Abra o app Sentinela AI PPCS Bridge, selecione o APK V360 Pro e deixe-o aberto.';
  }
}
document.getElementById('ppcsConnect').addEventListener('click', async () => {
  const did = document.getElementById('ppcsDid').value.trim();
  const password = document.getElementById('ppcsPassword').value;
  const deviceType = document.getElementById('ppcsType').value.trim() || '43';
  const result = document.getElementById('ppcsResult');
  const button = document.getElementById('ppcsConnect');
  if (!did || !password) {
    result.textContent = 'Informe o DID e a senha do dispositivo. Não existe senha universal confiável para presumir aqui.';
    return;
  }
  if (!ppcsBridgeOnline) {
    await ppcsCheckBridge();
    if (!ppcsBridgeOnline) return;
  }
  button.disabled = true;
  result.textContent = 'Inicializando PPCS e autenticando no dispositivo...';
  try {
    await ppcsRequest('/api/bridge/init', {});
    const started = await ppcsRequest('/api/agent/start', {
      did, password, device_type: deviceType, user_id: 0,
      resolution: 1, stream_type: 2, channel: 0,
      timeout_ms: 15000, connect_retry_delay_ms: 900
    });
    ppcsSession = Number(started.session);
    const codec = Number(started.live?.video_codec) === 3 ? 'h264' : 'hevc';
    const width = Number(started.live?.video_width) || 0;
    const height = Number(started.live?.video_height) || 0;
    document.getElementById('ppcsStreamBox').hidden = false;
    document.getElementById('ppcsStreamMeta').textContent = width && height ? width + ' × ' + height + ' · ' + codec.toUpperCase() : codec.toUpperCase();
    document.getElementById('ppcsStream').src = '/api/bridge/mjpeg?session=' + encodeURIComponent(ppcsSession) + '&fps=6&width=960&codec=' + codec + '&ts=' + Date.now();
    document.getElementById('ppcsStop').disabled = false;
    document.getElementById('sourceStat').innerHTML = '1 <small>/ 1</small>';
    document.getElementById('analysisStat').textContent = 'Ativa';
    document.getElementById('sourceName').textContent = 'V360 Pro · PPCS';
    const live = document.getElementById('liveState');
    if (live) { live.innerHTML = '<i></i> CONECTADO'; live.classList.add('on'); }
    result.textContent = 'Sessão iniciada. Login: ' + (started.login?.ret ?? 'confirmado') + '. Aguardando os primeiros frames de vídeo.';
    ppcsSetState('SESSÃO ATIVA', true);
    document.getElementById('ppcsPassword').value = '';
  } catch (error) {
    result.textContent = 'Falha ao conectar: ' + error.message + '. O protocolo PPCS foi validado em outro modelo V360; o tipo deste firmware pode ser diferente.';
    ppcsSetState('FALHA NA SESSÃO', true);
  } finally {
    button.disabled = false;
  }
});
document.getElementById('ppcsStop').addEventListener('click', async () => {
  const result = document.getElementById('ppcsResult');
  if (ppcsSession === null) return;
  try {
    await ppcsRequest('/api/agent/stop', { session: ppcsSession });
    result.textContent = 'Sessão encerrada com segurança.';
  } catch (error) {
    result.textContent = 'A sessão pode ter sido encerrada, mas houve um erro: ' + error.message;
  }
  ppcsSession = null;
  document.getElementById('ppcsStream').removeAttribute('src');
  document.getElementById('ppcsStreamBox').hidden = true;
  document.getElementById('ppcsStop').disabled = true;
  document.getElementById('sourceStat').innerHTML = '0 <small>/ 1</small>';
  document.getElementById('analysisStat').textContent = 'Inativa';
  document.getElementById('sourceName').textContent = 'Nenhuma fonte conectada';
  const live = document.getElementById('liveState');
  if (live) { live.innerHTML = '<i></i> SEM SINAL'; live.classList.remove('on'); }
  ppcsSetState('PONTE ONLINE', true);
});
const ppcsMotionCanvas = document.createElement('canvas');
ppcsMotionCanvas.width = 160; ppcsMotionCanvas.height = 90;
const ppcsMotionCtx = ppcsMotionCanvas.getContext('2d', { willReadFrequently: true });
setInterval(() => {
  const image = document.getElementById('ppcsStream');
  if (ppcsSession === null || !image || !image.complete || !image.naturalWidth) return;
  try {
    ppcsMotionCtx.drawImage(image, 0, 0, 160, 90);
    const pixels = ppcsMotionCtx.getImageData(0, 0, 160, 90).data;
    let changed = 0, sampled = 0;
    if (ppcsMotionPrevious) {
      for (let i = 0; i < pixels.length; i += 48) {
        const delta = Math.abs(pixels[i] - ppcsMotionPrevious[i]) + Math.abs(pixels[i+1] - ppcsMotionPrevious[i+1]) + Math.abs(pixels[i+2] - ppcsMotionPrevious[i+2]);
        if (delta > 90) changed++;
        sampled++;
      }
      const ratio = changed / Math.max(1, sampled);
      if (ratio > 0.12 && Date.now() - ppcsMotionAt > 5000) {
        ppcsMotionAt = Date.now();
        ppcsAppendEvent('Movimento detectado', 'alteração visual ' + Math.round(ratio * 100) + '%');
      }
    }
    ppcsMotionPrevious = new Uint8ClampedArray(pixels);
  } catch {}
}, 900);

ppcsCheckBridge();
setInterval(ppcsCheckBridge, 10000);
