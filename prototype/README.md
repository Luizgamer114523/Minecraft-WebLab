# WebLab Voxel Prototype 0.1.0

Experimento independente de jogo voxel no navegador. **Não é Minecraft Bedrock, não executa o APK e não contém código ou assets proprietários do Minecraft.**

## Executar
Abra `prototype/index.html` por um servidor HTTP/HTTPS. O Three.js é carregado pelo jsDelivr, portanto a primeira inicialização requer internet.

Exemplo:
`python -m http.server 8080` e abra `http://127.0.0.1:8080/prototype/`.

## Controles
- Desktop: WASD, espaço, mouse; clique esquerdo quebra e direito coloca; teclas 1–6 selecionam bloco.
- Touch: direcional esquerdo, arrastar no lado direito para olhar, botões pular/quebrar/colocar.
- Salvar mundo grava o estado em IndexedDB no navegador.

## Limitações conhecidas
Protótipo inicial: colisão simplificada, terreno pequeno pré-gerado, sem chunks dinâmicos, sem crafting real, sem ciclo dia/noite e sem compatibilidade de mundos Bedrock. Texturas e áudio são placeholders.
