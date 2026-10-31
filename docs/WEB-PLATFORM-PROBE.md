# Web Platform Probe — diagnóstico de compatibilidade

Versão: 0.2.0  
Data: 30/10/2026  
Rota: página inicial do Minecraft WebLab

## Objetivo

Medir APIs do navegador no aparelho que abre o WebLab, como uma primeira etapa de validação para uma futura aplicação WebAssembly. O probe não carrega, emula ou executa o APK Minecraft.

## Testes implementados

| Teste | Verificação |
|---|---|
| WebGL 2 | Cria contexto, compila/linka shaders GLSL ES 3.00 e desenha um triângulo de teste. Registra limites básicos e número de extensões. |
| WebGPU | Solicita adapter e device, registra limites e features expostas. Destrói o device de teste imediatamente. |
| Web Audio | Verifica disponibilidade da AudioContext. Um botão executa um tom curto somente após ação do usuário. |
| IndexedDB | Abre banco temporário, grava e lê um valor, remove o banco e consulta estimativa de uso/cota quando suportado. |
| Touch / Pointer | Verifica Pointer Events, maxTouchPoints e ponteiro coarse. |
| Gamepad | Verifica Gamepad API e número de controles conectados no momento do teste. |
| Threads / Workers | Executa um Worker Blob de ida e volta. Verifica SharedArrayBuffer e crossOriginIsolated. |
| Rede | Verifica Fetch, WebSocket e navigator.onLine sem transmitir dados ou fazer requisições externas. |

Também registra dados gerais fornecidos pelo navegador: família aproximada do navegador/SO, núcleos lógicos, memória estimada quando exposta, resolução CSS, pixel ratio, tipo de conexão quando exposto e contexto seguro.

## Privacidade

- Os testes rodam localmente na página.
- O relatório fica em memória no navegador até ser copiado ou baixado pelo usuário.
- Não há endpoint de telemetria, analytics ou envio automático.
- IndexedDB é usado apenas com um banco temporário, que é apagado depois do teste bem-sucedido.
- O tom de áudio só é reproduzido mediante toque no botão correspondente.

## Interpretação

- WebGL 2 aprovado indica que o navegador consegue criar um contexto, compilar shaders GLSL ES 3.00 e desenhar um triângulo. Não comprova compatibilidade do renderer completo do Bedrock.
- WebGPU aprovado indica que adapter e device de teste foram criados. Não prova equivalência com OpenGL ES 3.1.
- AudioContext disponível não prova equivalência com FMOD.
- IndexedDB funcionando não prova que cotas, persistência ou desempenho suportam mundos grandes.
- Worker funcional sem SharedArrayBuffer/crossOriginIsolated não atende ao caminho de pthreads compartilhados do Emscripten.
- Gamepad API disponível não significa que existe um controle conectado.
- A classificação geral é um resumo do navegador; não é pontuação nem previsão de FPS.

## Limitações

1. A página é um probe de browser, não um benchmark de GPU nem um teste de desempenho do jogo.
2. O navegador pode ocultar memória, CPU, modelo do dispositivo, limites ou detalhes da GPU por privacidade.
3. WebGPU pode estar desativado por versão, flags, políticas ou driver, mesmo com hardware compatível.
4. O teste de threads usa Worker criado por Blob; Content Security Policy pode bloquear esse mecanismo sem que todo tipo de Worker esteja indisponível.
5. Nenhum teste tenta acessar APIs privadas, remover licenciamento, ignorar autenticação ou modificar o APK.

## Próximas etapas

1. Executar o probe em pelo menos um Android real e recolher o JSON voluntariamente para avaliação.
2. Comparar limitações observadas com as dependências Android levantadas em MAPEAMENTO-COMPATIBILIDADE-WEB.md.
3. Definir um alvo de navegador/dispositivo e uma matriz de versões suportadas.
4. Continuar buscando uma via autorizada de código-fonte/pipeline do motor. O APK nativo não pode ser transformado diretamente em WASM.
