# Minecraft WebLab — motor gráfico

## Arquitetura

O WebLab usa um renderer voxel próprio para navegador. Ele não é uma conversão do motor Bedrock e não executa o APK. A meta é reaproveitar os dados originais locais do pacote Bedrock em um runtime web independente.

## Princípios

- WebGL 2 como backend mínimo; WebGPU pode ser avaliado depois.
- Chunks em buffers tipados, sem um objeto 3D por bloco.
- Greedy meshing com merge condicionado ao material de cada face.
- Atlas local derivado de `bedrock-resource-index.json` ou de um Resource Pack.
- Recursos proprietários continuam locais; APK, biblioteca nativa e texturas comerciais não entram no Git público.

## Etapas

1. <strong>Fundação de dados e geometria</strong>: storage de chunks, seis faces, vizinhos e greedy meshing. Implementada e coberta por testes.
2. <strong>Renderer WebGL2</strong>: shaders, atlas, buffers GPU, depth test, culling e câmera livre. Implementado; falta validar visualmente em GPU real e em Chrome Android.
3. <strong>Importação de recursos</strong>: index Bedrock, PNG/JPEG/WebP/TGA, atlas e substituição opcional por imagens 512px. Implementada em modo experimental.
4. <strong>Interação do mundo</strong>: colisão, gravidade, raycast, quebrar/colocar, atualização incremental de mesh e seleção de bloco.
5. <strong>Fidelidade Bedrock</strong>: tintas de bioma, transparência, água, iluminação/AO, modelos especiais, animações, partículas e entidades.
6. <strong>Sistemas de jogo</strong>: inventário, crafting, persistência local, configurações e multiplayer quando houver protocolo/servidor compatível.

## Critérios de conclusão da primeira demo

A demo visual só deve ser considerada validada depois de:
- executar o build de produção;
- abrir em Chrome Android com WebGL2;
- carregar o pacote original local;
- mostrar texturas diferentes por face, inclusive grama superior/lateral/inferior;
- permitir movimentar e olhar sem pulo automático ou controles falsos;
- medir FPS, chunks, quads e draw calls no aparelho.
