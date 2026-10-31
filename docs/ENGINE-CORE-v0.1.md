# Engine Core v0.1 — arquitetura e validação

## Pipeline

1. `bedrock-pack-loader.js` lê os arquivos selecionados no navegador. Dá preferência a `bedrock-resource-index.json`; também consegue montar um índice básico a partir de `blocks.json` e `textures/terrain_texture.json`.
2. `bedrock-registry.js` atribui IDs a blocos e materiais e resolve o alias correto para cada uma das seis faces.
3. `terrain-generator.js` cria uma cena de teste em chunks 16×16×64 usando IDs do pacote carregado.
4. `greedy-mesher.js` oculta faces adjacentes, respeita o material da face e une retângulos coplanares equivalentes.
5. `texture-atlas.js` decodifica PNG/JPEG/WebP/TGA, monta um atlas local e cria coordenadas UV por material.
6. `webgl2-renderer.js` envia um buffer intercalado por chunk para a GPU e renderiza com shaders GLSL ES 3.00.
7. `first-person-controller.js` fornece câmera livre por WASD/mouse e joystick/gestos touch.

## Decisões para aparelhos móveis

- WebGL 2 é o backend mínimo; WebGPU fica para uma etapa futura.
- Geometria agregada por chunk, sem um objeto GPU por bloco.
- Atlas único com filtragem nearest e sem mipmaps nesta primeira etapa.
- Texturas de origem acima de 128 px por lado são reduzidas para 128 px nesta configuração equilibrada. Os arquivos originais não são alterados.
- DPR limitado a 1,5 para reduzir o custo de pixels renderizados em telas móveis.

## Verificações executadas

`npm test`: cinco testes passaram em Node 22 (Chunk, winding das seis faces, greedy merge, fronteira entre chunks e materiais por face).

Com o `bedrock-resource-index.json` gerado a partir dos arquivos fornecidos: 461 definições de blocos, 559 aliases de material, 16 chunks e 3.983 quads na cena de validação.

O pipeline JavaScript e a malha foram validados. A compilação Vite e a validação visual com GPU real ainda precisam ser verificadas no ambiente de deploy e no Chrome Android; o ambiente headless desta execução não inicializou EGL/ANGLE.

## Limites de fidelidade

`blocks.json` e `terrain_texture.json` fornecem aliases e imagens, não a totalidade das regras de renderização Bedrock. Ainda faltam tintas de bioma/overlay, variantes com peso e isotropia completa, texturas animadas, materiais alpha blend, modelos de bloco especiais, iluminação/ambient occlusion, biomes, fogs, entidades e render controllers. A cena procedural serve apenas para validar o caminho bloco → material → malha → GPU.

Este renderer é um runtime web independente baseado em recursos Bedrock locais. Ele não executa o APK original nem contém o motor proprietário do Minecraft.
