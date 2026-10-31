# Minecraft WebLab — motor gráfico

## Decisão de arquitetura

O WebLab terá um renderer voxel próprio para navegador. Ele não é uma conversão do motor Bedrock e não executa o APK. A meta é reutilizar os dados originais locais do pacote Bedrock (definições, mapas de textura, imagens, modelos e materiais) em um runtime web independente.

## Princípios

- WebGL 2 como backend mínimo; WebGPU será um backend opcional após estabilizar a renderização.
- Chunks em buffers tipados, sem criar um objeto 3D por bloco.
- Greedy meshing para fundir faces coplanares e reduzir draw calls.
- Atlas/array de texturas derivado do terrain_texture.json original.
- Definições de bloco carregadas do índice produzido pelo importador existente.
- Sem publicar APK, libminecraftpe.so ou recursos proprietários no repositório público.
- Sem chamar um protótipo simplificado de Minecraft Bedrock.

## Etapas

1. **Fundação de dados e geometria** (iniciada): matemática 3D, armazenamento de chunks e greedy meshing.
2. **Renderer WebGL2**: shaders, buffers GPU, câmera, depth test, frustum e renderização de chunks.
3. **Importação de recursos**: ler bedrock-resource-index.json, carregar PNG/TGA e gerar atlas sem alterar os arquivos fonte.
4. **Mundo e interação**: geração de terreno, seleção de bloco, raycast, quebrar/colocar e colisão.
5. **Controles mobile**: joystick, olhar por arrasto, pulo e inventário.
6. **Entidades e fidelidade**: modelos Bedrock, geometria por face, animações, biomas, iluminação e efeitos.

## Estado honesto

A fundação de dados/meshing está iniciada. Ainda não existe uma cena renderizada ou um jogo jogável. Cada etapa será validada antes de avançar. A primeira demo visual só será considerada válida quando desenhar chunks pelo pipeline GPU, usar as texturas reais importadas e permitir controlar a câmera.
