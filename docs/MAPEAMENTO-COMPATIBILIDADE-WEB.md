# Mapa de integração: Bedrock Android 1.26.60 → navegador

Data da auditoria: 30/10/2026  
Base analisada: APK enviado nesta conversa, sem execução dinâmica.  
Biblioteca principal analisada: `lib/arm64-v8a/libminecraftpe.so`.

> Este documento registra evidências de uma inspeção estática. Nomes de símbolos indicam contratos e dependências, mas não provam por si só que todos os caminhos são executados em toda sessão. Nenhum binário, recurso comercial ou arquivo extraído do jogo foi adicionado ao repositório.

## 1. Resultado executivo

A biblioteca principal é um ELF64 AArch64, não um módulo WebAssembly. A análise encontrou estes grupos de dependências:

| Subsistema | Evidência observada | Quantidade/indicador |
|---|---|---:|
| Asset Manager Android | AAssetManager/AAsset | 10 funções |
| Configuração Android | AConfiguration | 5 funções |
| Looper / janela nativa | ALooper + ANativeWindow | 14 funções |
| EGL | criação/gestão de contexto e surface | 16 funções |
| OpenGL ES importado estaticamente | funções gl* importadas | 82 funções |
| Threading/sincronização | pthread, semáforos, epoll | 55 funções |
| FMOD | API C/C++ de áudio | 31 símbolos relevantes |
| HTTP, WebSocket e task queues | HC*, XAsync*, XTaskQueue* | 77 símbolos |
| PlayFab Multiplayer | PFMultiplayer* | 13 funções |
| Ponte Java/JNI | exports Java_* | 95 funções |

Além das 82 funções GL importadas, foram encontrados 206 nomes de funções gl* em strings da biblioteca, inclusive APIs avançadas como `glDispatchCompute`, `glBindImageTexture`, `glMemoryBarrier`, `glDrawElementsIndirect` e `glTexImage3D`. A presença em strings, junto de `eglGetProcAddress`, sugere caminhos opcionais/extensões resolvidos em tempo de execução; não prova que todos estejam ativos em todos os aparelhos.

A string `OpenGL ES 3.1` também aparece no binário. Isso aumenta o risco gráfico: WebGL 2 é baseado em OpenGL ES 3.0, não cobre automaticamente toda a superfície ES 3.1 ou extensões do fabricante.

## 2. Inicialização e ciclo de vida

### Evidência Android

A tabela de classes DEX confirma que:

- `com.mojang.minecraftpe.MainActivity` herda de `com.google.androidgamesdk.GameActivity`.
- `GameActivity` cria uma `SurfaceView` (`InputEnabledSurfaceView`) e possui callbacks nativos de superfície.
- O motor exporta `Java_com_google_androidgamesdk_GameActivity_initializeNativeCode`.
- Existem exports para callbacks do Choreographer e Swappy, usados pelo agendamento/apresentação de frames.
- `MainActivity` possui `onCreate`, `onStart`, `onResume`, `onPause`, `onStop`, `onDestroy`, `onWindowFocusChanged`, além de métodos nativos `nativeSuspend`, `nativeShutdown`, `nativeOnDestroy`, `nativeResize` e outros.

A classe GameActivity contém métodos/callbacks nativos para:

- `onSurfaceCreatedNative`
- `onSurfaceChangedNative`
- `onSurfaceDestroyedNative`
- `onSurfaceRedrawNeededNative`
- `onPauseNative` / `onResumeNative`
- `onStartNative` / `onStopNative`
- `onWindowFocusChangedNative`
- `onConfigurationChangedNative`
- `onTrimMemoryNative`
- `onTouchEventNative`
- `onKeyDownNative` / `onKeyUpNative`
- `onTextInputEventNative` / `onEditorActionNative`

### Adaptador de navegador proposto

| Contrato Android | Substituição web | Observação |
|---|---|---|
| GameActivity / Activity lifecycle | `document.visibilitychange`, `pagehide`, `pageshow`, foco/blur e eventos de página | Não existe ciclo de Activity idêntico; suspender e retomar precisa ser implementado no motor. |
| SurfaceView | `HTMLCanvasElement` | Canvas é o destino de renderização; redimensionar com `ResizeObserver` e pixel ratio controlado. |
| Surface created/destroyed | criação/perda/restauração de contexto WebGL | Tratar `webglcontextlost` e `webglcontextrestored`. |
| Choreographer / Swappy | `requestAnimationFrame` ou main loop do Emscripten | O ritmo de apresentação e o pacing de frames não são equivalentes automaticamente. |
| ANativeWindow dimensions | `canvas.width`, `canvas.height`, CSS size e `devicePixelRatio` | Separar tamanho visual CSS do tamanho real do framebuffer. |
| Window focus / trim memory | eventos web + redução de recursos/caches | O navegador pode suspender uma aba em segundo plano. |

## 3. Assets e sistema de arquivos

### Evidência encontrada

Imports Android diretos:

- `AAssetManager_fromJava`
- `AAssetManager_open`, `AAssetManager_openDir`
- `AAsset_read`, `AAsset_seek64`, `AAsset_getLength64`
- `AAsset_close`, operações de diretório
- `AConfiguration_fromAssetManager`, idioma e país

A classe Java MainActivity também possui métodos para obter caminhos de armazenamento interno/externo, abrir/guardar arquivos, copiar arquivos selecionados e solicitar permissões.

### Adaptador web proposto

- Conteúdo empacotado e somente leitura: pré-carregar ou baixar por blocos para um sistema de arquivos virtual do Emscripten. A camada de assets deve preservar os caminhos lógicos esperados pelo motor.
- Mundos, configurações e dados mutáveis: armazenamento persistente do navegador, inicialmente IndexedDB/Emscripten FS; avaliar OPFS quando o modelo de acesso e a compatibilidade dos navegadores-alvo forem conhecidos.
- Importar/exportar mundos: fluxo de upload/download acionado pelo usuário; não presumir acesso livre ao armazenamento do Android.
- Operações de asset síncronas: precisam encontrar dados já disponíveis no FS virtual. Uma chamada `fetch()` é assíncrona, então não se pode trocar AAssetManager por fetch síncrono sem redesenhar o carregamento ou pré-carregar os recursos.
- Vercel deve servir somente código e arquivos legalmente distribuíveis. O APK, bibliotecas nativas e pacotes comerciais não serão copiados para o repositório ou hospedagem pública.

**Risco:** alto. O motor espera semântica nativa de arquivos e caminhos Android, enquanto o navegador usa APIs assíncronas, permissões e cotas de armazenamento.

## 4. Janela, EGL e renderer

### Evidência encontrada

Imports EGL:

`eglGetDisplay`, `eglInitialize`, `eglChooseConfig`, `eglCreateContext`, `eglCreateWindowSurface`, `eglMakeCurrent`, `eglSwapBuffers`, destruição e consulta de contexto.

Imports OpenGL ES incluem buffers, texturas, shaders/programas, framebuffers, renderbuffers, blend, depth/stencil, uniforms, draw calls, leitura de pixels e compressão de texturas.

A biblioteca importa `eglGetProcAddress` e contém nomes de 206 funções gl*. Entre as referências avançadas encontradas estão compute shaders, image load/store, chamadas indiretas/multi-draw, texturas 3D e program binaries. Isso indica que a auditoria não pode limitar-se à lista de 82 imports estáticos.

### Adaptador web proposto

- Canvas WebGL 2 como primeira hipótese de backend, após confirmar quais chamadas realmente são necessárias no caminho de renderização.
- `emscripten_webgl_create_context` / APIs HTML5 do Emscripten ou a camada EGL de compatibilidade do Emscripten podem ajudar em código-fonte portável; não transformam automaticamente o binário Android.
- Recursos GLES 3.0 que mapeiam diretamente podem ser candidatos a WebGL 2.
- Recursos ES 3.1/extensões sem equivalência WebGL direta exigem alternativa no renderer, fallback ou backend novo em WebGPU.
- WebGPU é uma opção de backend a ser investigada, mas não é uma tradução automática de chamadas OpenGL/EGL. Shaders, sincronização, buffers e render graph precisariam de adaptação.
- Verificar extensões WebGL disponíveis em tempo de execução e manter fallback para celulares sem suporte a extensões necessárias.

**Risco:** muito alto. A string ES 3.1 e a lista dinâmica de chamadas avançadas são os principais pontos de incerteza gráfica.

## 5. Entrada, toque, teclado, gamepad e texto

### Evidência encontrada

A classe GameActivity declara callbacks nativos para toque, teclado e texto. A MainActivity implementa `dispatchGenericMotionEvent`, `dispatchKeyEvent`, `onKeyUp`, `onTrackballEvent`, `lockCursor`, `unlockCursor`, `initiateUserInput` e manipulação do teclado virtual.

A classe `JellyBeanDeviceManager` e oito exports JNI relacionados identificam descoberta/remoção de dispositivos e reconhecimento de controles Xbox, PlayStation e DualSense.

### Adaptador web proposto

- Toque e gestos: Pointer Events com suporte a múltiplos ponteiros; área de toque virtual sobre o canvas para controles mobile.
- Teclado: Keyboard Events, com cuidado para não bloquear teclas do navegador sem necessidade.
- Texto/chat: elemento HTML `input`/`textarea` oculto ou integrado, focado sob ação do usuário para acionar teclado virtual do celular; sincronizar composição/IME e seleção.
- Gamepad: Gamepad API para controles USB/Bluetooth.
- Mouse: Pointer Lock somente em navegadores/dispositivos que oferecem esse recurso; no celular usar controles touch.
- Orientação e safe areas: adaptar o layout à rotação e recortes do aparelho; pedir permissões somente quando uma API exigir.

## 6. Áudio

### Evidência encontrada

A biblioteca importa símbolos FMOD para criação/controle de sistemas, sons/streams, canais, grupos, volume, pitch, pausa, looping, áudio 3D, listeners, fade points, callbacks e mixer. O DEX também contém referências a `AudioTrack` e `AudioManager`.

### Adaptador web proposto

- Web Audio API como destino de áudio.
- `AudioContext` e nós de áudio para fontes, ganho, filtros e posicionamento espacial.
- AudioWorklet para processamento personalizado em tempo real, se necessário.
- Desbloqueio do áudio após gesto explícito do usuário, conforme política do navegador.
- Implementar equivalência para os recursos FMOD realmente usados; não assumir que cada função FMOD tenha substituição direta.

**Risco:** alto. FMOD é um subsistema completo, não apenas uma chamada para tocar um arquivo.

## 7. Rede, contas e multiplayer

### Evidência encontrada

- 77 símbolos importados de HTTP Client, WebSocket e task queues, incluindo `HCHttpCallPerformAsync`, `HCWebSocketConnectAsync`, `HCWebSocketSendMessageAsync`, `XAsync*` e `XTaskQueue*`.
- 13 funções PlayFab Multiplayer, incluindo descoberta/criação/entrada em lobbies e processamento de mudanças de estado.
- Imports POSIX adicionais como `socket`, `connect`, `sendto`, `recvfrom`, `getaddrinfo`, `poll` e `epoll_*`.
- Métodos Java ligados a login, tokens, configurações Xbox, armazenamento seguro e callbacks HTTP.
- JNI inclui `nativeSetIntegrityToken` e `nativeSetIntegrityTokenErrorMessage`; o APK também declara dependência de `libpairipcore.so`.

### Adaptador web proposto

- HTTP: Fetch API, com tratamento de CORS, autenticação, cookies/tokens e cancelamento.
- WebSocket: API WebSocket para serviços que realmente usem WebSocket.
- Multiplayer: integração web autorizada com serviços e protocolos oficiais; APIs PlayFab/contas Xbox não são substituídas por um WebSocket genérico.
- Sockets arbitrários/UDP e epoll: não existem como sockets POSIX irrestritos no navegador; precisam de protocolo de rede suportado pela web, proxy/serviço apropriado ou alteração no código.
- Identidade e integridade: implementar fluxo web oficial e autorizado. Não remover, neutralizar ou contornar verificações de integridade, licenciamento ou autenticação.
- Não colocar segredos de serviço no frontend nem tentar contornar CORS com credenciais privilegiadas.

**Risco:** muito alto. Rede, login e multiplayer envolvem serviços de plataforma, autenticação e protocolos que não podem ser reconstruídos apenas pelos nomes dos imports.

## 8. Threads, eventos e tempo

### Evidência encontrada

A biblioteca importa pthreads, mutexes, condition variables, read/write locks, semáforos, epoll, sinais, afinidade/prioridade de CPU, mmap e sincronização.

### Adaptador web proposto

- Emscripten pthreads com Web Workers/SharedArrayBuffer para o código que realmente precisa de threads.
- O deploy precisa de cabeçalhos COOP/COEP para permitir SharedArrayBuffer nos navegadores que o exigem.
- DOM e Canvas devem permanecer no thread principal ou ser acessados por mecanismos de proxy/OffscreenCanvas compatíveis.
- Substituir event loops baseados em Looper/epoll por filas/eventos de browser e mecanismos suportados por Emscripten.
- Testar comportamento em mobile real: limites de memória, número de workers, throttling e suspensão em segundo plano.

**Risco:** muito alto em conjunto com memória e renderer. Habilitar pthreads no build não resolve automaticamente dependências de epoll, prioridades Android ou callbacks de UI.

## 9. Matriz de prioridade e viabilidade

| Subsistema | API web candidata | Risco | Situação |
|---|---|---|---|
| Canvas / superfície | HTMLCanvasElement + WebGL | Muito alto | Precisa de alteração no motor |
| GLES avançado | WebGL2 / backend WebGPU | Muito alto | Compatibilidade ainda não provada |
| Asset Manager | FS virtual + fetch/preload | Alto | Semântica síncrona exige adaptação |
| Save data | IndexedDB / OPFS | Médio-alto | Implementável em código-fonte |
| Ciclo de vida | Page Visibility + Page Lifecycle | Alto | Contratos precisam ser redesenhados |
| Touch/keyboard/text | Pointer/Keyboard Events + HTML input | Médio-alto | Candidato viável com adaptação |
| Gamepad | Gamepad API | Médio | Candidato viável |
| Audio/FMOD | Web Audio + AudioWorklet | Alto | Requer backend de áudio |
| HTTP | Fetch | Alto | Requer camada web e autenticação |
| WebSocket | WebSocket | Alto | Só para protocolos compatíveis |
| PlayFab/Xbox | SDK/fluxo web autorizado | Muito alto | Verificar disponibilidade e licenças |
| Pthreads | Emscripten pthreads | Muito alto | Exige COOP/COEP e código-fonte |
| Android-only APIs | wrappers/feature degradation | Muito alto | Algumas capacidades não têm equivalente web |

## 10. Próximas ações técnicas

1. Obter acesso autorizado ao código-fonte do motor e ao pipeline/build compatível com WebAssembly. O APK não é suficiente para recompilar o motor.
2. Com acesso ao código, localizar as abstrações já existentes de plataforma: arquivos, renderização, janela, eventos, áudio, rede, contas e threads.
3. Criar um build mínimo sem assets comerciais para validar toolchain, inicialização WASM, Canvas e contexto WebGL em desktop e Android.
4. Fazer testes de compatibilidade de renderer com a lista real de chamadas e extensões necessárias; decidir WebGL 2 ou um backend WebGPU.
5. Só depois conectar recursos do jogo e serviços oficiais, respeitando licença, autenticação e distribuição.

## 11. Fontes técnicas da camada web

- Emscripten: [Porting C/C++ applications](https://emscripten.org/docs/porting/index.html)
- Emscripten: [OpenGL support](https://emscripten.org/docs/porting/multimedia_and_graphics/OpenGL-support.html)
- Emscripten: [EGL support](https://emscripten.org/docs/porting/multimedia_and_graphics/EGL-Support-in-Emscripten.html)
- Emscripten: [Pthreads support](https://emscripten.org/docs/porting/pthreads.html)
- Emscripten: [WebGPU support](https://emscripten.org/docs/porting/multimedia_and_graphics/WebGPU-support.html)
- MDN: [WebGL](https://developer.mozilla.org/pt-BR/docs/Web/API/WebGL_API)
- MDN: [Web Audio API](https://developer.mozilla.org/pt-BR/docs/Web/API/Web_Audio_API)
- MDN: [Gamepad API](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API)

## Conclusão

O mapa identifica as interfaces Android que precisariam ser substituídas e aponta um risco adicional importante: a biblioteca contém referências a uma superfície gráfica mais ampla que apenas GLES 2.0. A camada Java/GameActivity expõe pontos claros de ciclo de vida, superfície, input e texto; por outro lado, renderer, FMOD, PlayFab/Xbox, sockets e threading formam dependências grandes.

**Este documento é uma especificação de portabilidade baseada em evidências estáticas, não um port funcional.** Sem acesso autorizado ao código-fonte e ao processo de build, não é possível transformar `libminecraftpe.so` em um WASM funcional apenas editando o APK.
