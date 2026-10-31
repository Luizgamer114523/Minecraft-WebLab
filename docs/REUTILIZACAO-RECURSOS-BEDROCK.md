# Reutilização dos recursos originais do Bedrock

Data da preparação: 31/10/2026
Fonte: árvore extraída do APK Minecraft Bedrock 1.26.60 fornecida pelo usuário.

## Regra principal

O WebLab deve reaproveitar os dados e recursos originais do pacote Bedrock. Não substituir imagens existentes por cores inventadas, nem apresentar um jogo voxel genérico como se fosse uma conversão do Minecraft.

O APK contém o motor nativo Android em lib/arm64-v8a/libminecraftpe.so, no formato ELF64/AArch64. Ele depende de APIs Android, JNI, EGL/OpenGL ES, áudio e outros componentes nativos. O Chrome não carrega diretamente APKs ou bibliotecas ELF Android. Sem o código-fonte e o pipeline de build autorizados, não existe conversão direta desse binário para WebAssembly. Ver docs/ANALISE-APK-26.60.md.

## Recursos de origem identificados

A árvore extraída inclui o pacote vanilla principal e o overlay vanilla_1.26.50 utilizado junto à base de recursos do jogo 1.26.60. Entre os arquivos de origem estão:

- blocks.json: definições de blocos, nomes de textura por face, sons e propriedades.
- textures/terrain_texture.json: associação entre chaves de textura e arquivos de imagem, incluindo variantes e parâmetros de tint/overlay.
- textures/blocks: imagens reais de blocos em PNG e TGA.
- biomes_client.json: dados visuais dos biomas.
- materiais, shaders, modelos, entidades, animações e partículas.
- contêineres BRArchive, usados para agrupar arquivos internos do pacote vanilla.

## Formato BRArchive

O importador reconhece o cabeçalho de 8 bytes 7d 27 25 b1 a0 52 70 26, lê a contagem de entradas como uint32 little-endian no offset 8 e percorre registros de 256 bytes a partir do offset 16. Cada registro contém o comprimento e nome do arquivo, seguido por offset e tamanho do conteúdo. A área de dados começa em 16 + quantidade_de_entradas × 256.

O importador expande os membros relevantes mantendo os caminhos lógicos e bloqueando caminhos absolutos ou tentativas de sair do diretório de destino. O overlay é aplicado depois do pacote base.

## Verificação com os arquivos fornecidos

A execução local do importador produziu os seguintes resultados:

- 108 contêineres BRArchive relevantes processados.
- 4.811 membros de BRArchive expandidos.
- 9.630 arquivos copiados ou expandidos para a pasta local de trabalho.
- 461 definições de blocos após mesclar a base e o overlay.
- 560 chaves no mapa de texturas.
- 1.289 referências de textura verificadas.
- 0 referências sem arquivo correspondente.
- Aproximadamente 38 MiB na saída local.

Exemplo real: o bloco de grama mapeia a face superior para grass_top, a face inferior para grass_bottom e as laterais para grass_side. A face inferior e as laterais não devem receber a mesma imagem da face superior. O arquivo lateral original pode ser TGA e deve ser carregado no formato correto.

## Importação local

1. Extraia o arquivo 7z fornecido para uma pasta local.
2. Confirme que a pasta de entrada contém vanilla e vanilla_1.26.50.
3. Na raiz do repositório, instale Node.js e execute:

    npm run prepare:bedrock-assets -- --input "/caminho/para/tudo do Minecraft/assets/assets/resource_packs" --output public/bedrock-assets

O importador está em tools/bedrock/prepare-web-assets.mjs. Ele gera bedrock-resource-index.json e IMPORT-REPORT.json junto aos recursos extraídos. Os dados são lidos da cópia local; não dependem de texturas reconstruídas manualmente.

## Proteção dos arquivos

O repositório GitHub é público. A pasta public/bedrock-assets/, os APKs, bibliotecas nativas, arquivos BRArchive, pacotes e mundos comerciais são ignorados pelo Git. Não publicar o APK, libminecraftpe.so, o pacote vanilla ou imagens proprietárias extraídas sem autorização de distribuição. O importador é versionado; os recursos originais permanecem locais.

## Limite do que foi realizado

Este passo reutiliza e indexa os recursos originais. Ele não executa o motor Bedrock, não converte libminecraftpe.so para WASM e não afirma que o Minecraft original já roda no Chrome.

Para executar exatamente o binário original mantendo o motor existente, o caminho prático é executar o APK em um host Android compatível e transmitir vídeo, áudio e controles para o navegador. Para execução local em WebAssembly, é necessário obter uma build web autorizada ou código-fonte e pipeline de compilação compatíveis. A construção de um renderer baseado nos recursos extraídos só deve começar depois de validar o caminho pretendido, e não deve ser confundida com o jogo original.