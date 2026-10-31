# Minecraft WebLab

Estudo técnico para preservar e investigar o Minecraft Bedrock Android 1.26.60 em uma experiência acessível pelo navegador, priorizando o reaproveitamento dos arquivos originais fornecidos pelo usuário.

## Objetivo

Não criar um clone simplificado e apresentá-lo como conversão do Minecraft. A meta é aproveitar definições, texturas, materiais, shaders e demais dados originais. A página inicial continua sendo o diagnóstico de compatibilidade do navegador.

## Recursos Bedrock originais

A extração fornecida contém o pacote vanilla e o overlay vanilla_1.26.50, com definições de blocos, mapa de texturas, imagens PNG/TGA, biomas, materiais e contêineres BRArchive. O importador local está em tools/bedrock/prepare-web-assets.mjs.

Consulte docs/REUTILIZACAO-RECURSOS-BEDROCK.md para formato BRArchive, estatísticas verificadas, exemplo de mapeamento por face e instruções de importação.

Para preparar os arquivos localmente, depois de extrair o 7z:

    npm install
    npm run prepare:bedrock-assets -- --input "/caminho/para/tudo do Minecraft/assets/assets/resource_packs" --output public/bedrock-assets

Resultado verificado com os arquivos fornecidos: 108 contêineres BRArchive, 4.811 membros expandidos, 461 definições de blocos, 560 chaves de textura, 1.289 referências resolvidas e nenhuma referência pendente.

Os recursos extraídos ficam locais. A pasta public/bedrock-assets/ e os arquivos proprietários são ignorados pelo Git. O repositório público contém apenas o importador e a documentação, não o APK, bibliotecas ou recursos comerciais.

## Limite técnico do APK

O APK enviado contém um motor nativo ARM64 em lib/arm64-v8a/libminecraftpe.so e depende de Android, JNI, EGL/OpenGL ES, áudio e outros componentes. O Chrome não executa APKs ou bibliotecas ELF Android diretamente. Emscripten não converte um ELF Android já compilado em um port WASM funcional.

Há duas rotas para preservar o jogo original: obter uma build web autorizada/código-fonte e pipeline de compilação do motor, ou executar o APK num host Android compatível e transmitir imagem, áudio e controles para o navegador. Reimplementar um renderer/gameplay web com os dados Bedrock é outra categoria de projeto e não equivale a executar o Minecraft original.

## Diagnóstico do navegador

O probe da página inicial verifica WebGL 2, WebGPU, Web Audio, IndexedDB, toque, Gamepad, Workers/SharedArrayBuffer e APIs de rede localmente, sem telemetria. Consulte docs/WEB-PLATFORM-PROBE.md e docs/MAPEAMENTO-COMPATIBILIDADE-WEB.md.

## Estado atual

- Análise estática do APK: concluída.
- Diagnóstico de capacidades do Chrome: implementado.
- Extração/indexação local dos recursos vanilla + overlay: testada.
- Execução do motor original no Chrome: ainda não implementada; depende de uma via autorizada de build web ou de streaming Android.
- Nenhum clone voxel genérico será tratado como conversão do Bedrock.