# Minecraft WebLab

Laboratório de renderização 3D para navegador que reaproveita definições e recursos locais do Minecraft Bedrock Android 1.26.60 fornecidos pelo usuário.

## Abrir o motor

Depois de instalar as dependências:

    npm install
    npm run dev

Abra \`/engine/\` no endereço local do Vite. Para compilar as duas páginas:

    npm run build

A página inicial continua sendo o diagnóstico de compatibilidade. O motor experimental fica em \`engine/\`.

## Recursos Bedrock

A extração fornecida contém o pacote vanilla e o overlay \`vanilla_1.26.50\`, com definições de blocos, mapas de textura, imagens PNG/TGA, materiais e contêineres BRArchive.

Para preparar o índice e os arquivos localmente:

    npm run prepare:bedrock-assets -- --input "/caminho/para/resource_packs" --output public/bedrock-assets

No motor, selecione a pasta \`public/bedrock-assets\` ou compacte o seu conteúdo em ZIP e carregue-o no navegador. Também é possível selecionar uma pasta de Resource Pack com \`blocks.json\` e \`textures/terrain_texture.json\`. O ZIP opcional de texturas 512px pode ser aplicado depois da inicialização pelo botão \`512px\`.

Os recursos permanecem locais no aparelho do usuário. \`public/bedrock-assets/\`, APKs, bibliotecas e pacotes comerciais são ignorados pelo Git. Não envie esses arquivos ao repositório público.

## Engine Core v0.1

- WebGL 2 com shaders GLSL ES 3.00, depth test e back-face culling.
- Chunks compactos 16×16×altura em typed arrays.
- Greedy meshing com remoção de faces internas e separação de materiais por face.
- Atlas de texturas local com PNG, JPEG, WebP e TGA (inclui TGA RLE).
- IDs de bloco e material resolvidos a partir de \`bedrock-resource-index.json\`.
- Cena de validação procedural com relevo, camadas e árvores usando aliases do pacote carregado.
- Câmera livre com WASD/mouse e joystick/olhar por toque em dispositivos móveis.

Validação de código: \`npm test\` executa cinco testes para storage, winding, greedy merge, costuras de chunks e materiais por face. A compilação e a validação visual com GPU real ainda precisam ser confirmadas no ambiente de deploy e no Chrome Android.

## Limites

Este projeto **não executa o APK original** e não é uma conversão oficial do motor Bedrock. O renderer web interpreta parte dos dados dos Resource Packs em um runtime independente. \`blocks.json\` e \`terrain_texture.json\` não descrevem todas as regras do jogo.

Ainda faltam física e colisão, raycast, quebrar/colocar blocos, seleção, iluminação/ambient occlusion, tintas de bioma, transparência correta, água, modelos Bedrock especiais, entidades, animações, inventário, salvamento e multiplayer.

## Análise do APK e arquitetura

Consulte:

- \`docs/ANALISE-APK-26.60.md\`
- \`docs/REUTILIZACAO-RECURSOS-BEDROCK.md\`
- \`docs/ENGINE-CORE-v0.1.md\`
- \`docs/ENGINE-ROADMAP.md\`
