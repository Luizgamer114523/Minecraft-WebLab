# Análise técnica do Minecraft Bedrock 1.26.60

## Objetivo
Avaliar se o APK Android enviado pode ser executado diretamente em um navegador e identificar as opções técnicas para preservar a versão original, sem substituir o jogo por um clone simplificado.

## Arquivos recebidos
- `minecraft-26-60-.apk`: 378.816.625 bytes.
- `minecraft-26-60-.zip`: 369.062.190 bytes; contém um único arquivo, o APK acima.
- SHA-256 do APK: `adc4a338347818a088b94432f50be8b3cd412aae1775304df93033b439813f7b`.
- SHA-256 do ZIP: `cf3dbf185d126a6fea0af86c5009e9db078d57cdb0d3bfb1ac40b2230fad3e5f`.

## Inventário verificado
- APK ZIP válido com 13.396 entradas e cerca de 980.473.964 bytes descompactados.
- Biblioteca principal: `lib/arm64-v8a/libminecraftpe.so`, 342.231.392 bytes (326,4 MiB).
- A biblioteca é ELF64 little-endian, arquitetura AArch64 (ARM64).
- A tabela dinâmica da biblioteca tem 91.693 símbolos.
- Dependências nativas declaradas incluem `libGLESv2.so`, `libEGL.so`, `libandroid.so`, `liblog.so`, `libfmod.so`, `libPlayFabMultiplayer.so`, `libHttpClient.Android.so`, `libpairipcore.so` e `libc++_shared.so`.
- Foram encontrados quatro arquivos DEX, incluindo referências às classes Android `com.mojang.minecraftpe.MainActivity` e `com.google.androidgamesdk.GameActivity`.
- O APK possui 12.936 entradas sob `assets`.
- Categorias de maior volume: resource packs (302,1 MiB), renderer (186,1 MiB), GUI (45,7 MiB) e behavior packs (23,7 MiB).
- Os manifests dos pacotes vanilla de comportamento e recursos indicam versão `[1, 26, 60]`.
- O pacote de renderer contém materiais binários, incluindo materiais de chunks e entidades. Os dados do jogo também incluem arquivos compactados `.brarchive` e estruturas NBT.

## Conclusão de compatibilidade
O APK não pode ser aberto como se fosse um site. O motor é um executável nativo AArch64 para Android e depende de APIs Android e gráficas nativas. Navegadores executam JavaScript/WebAssembly e oferecem WebGL/WebGPU, não carregam diretamente APKs nem bibliotecas ELF Android.

Sem o código-fonte/licença de compilação do motor, não há um caminho direto e confiável para recompilar `libminecraftpe.so` como WebAssembly. Uma tradução binária/emulação teria de implementar também o ambiente Android, JNI, bibliotecas do sistema, gráficos, áudio, entrada e ciclo de vida. Isso não é uma simples conversão de arquivo.

## Caminhos tecnicamente possíveis

### A. Preservar o APK original
Executar o APK em um dispositivo/servidor Android compatível e transmitir imagem/áudio/controles para uma página web por streaming interativo. A página pode ficar na Vercel, mas o processo do jogo precisaria de um host separado, persistente e com recursos suficientes. Isso preserva o binário original, mas não é execução local no navegador.

### B. Port web nativo
Requer acesso autorizado ao código-fonte e ao pipeline de build do motor, ou uma implementação licenciada equivalente para WebAssembly/WebGL/WebGPU. Só então o motor poderia rodar diretamente no navegador.

### C. Reimplementação independente
Criar um jogo compatível em mecânicas, com engine web própria, é possível por etapas, mas não é o Minecraft original. Este caminho não deve ser apresentado como conversão do APK.

## Direção do projeto
O protótipo voxel simplificado anterior não é uma conversão do APK e não será tratado como base do port original. Antes de qualquer novo desenvolvimento de gameplay, a decisão de arquitetura deve respeitar a meta: preservar o APK original via streaming ou obter um caminho autorizado para um build Web do motor.

## Escopo e segurança
Esta foi uma inspeção estática de estrutura, dependências e metadados. Não houve execução do jogo, depuração dinâmica, nem extração/publicação dos recursos protegidos. O repositório não deve receber o APK completo, bibliotecas nativas ou pacotes comerciais de recursos.