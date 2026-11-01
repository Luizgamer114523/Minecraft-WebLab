# SENTINELA AI

Painel web local para monitoramento de uma câmera V360 Pro / CloudBirds, com análise de movimento no navegador e integração PPCS em desenvolvimento.

## Estado
- Dashboard responsivo, entrada por vídeo e câmera do navegador.
- Diagnóstico da rede local.
- Cliente PPCS baseado no protocolo publicado para a família V360 Pro.
- Ponte Android que carrega a biblioteca libPPCS_API.so diretamente do APK original selecionado pelo usuário.
- Stream ao vivo PPCS convertido para MJPEG por FFmpeg e exibido no painel.
- Detecção simples de movimento local, sem enviar o vídeo à Vercel.

## Iniciar no Android (Termux)

Pré-requisitos: Android ARM64, Termux, Node.js, Python 3 e FFmpeg.

1. Instale o APK de ponte Android gerado no GitHub Actions. Abra-o e selecione o APK original do V360 Pro enviado pelo usuário. O app extrai a biblioteca nativa localmente e mostra o estado da ponte.
2. No Termux:

~~~~bash
pkg update
pkg install git nodejs python ffmpeg
git clone https://github.com/lnzindev/Minecraft-WebLab.git
cd Minecraft-WebLab
npm install
npm run build
python bridge/ppcs_server.py
~~~~

3. Abra http://127.0.0.1:8787 no navegador do mesmo telefone.

A ponte Android precisa permanecer aberta. O servidor web e o vídeo escutam apenas em loopback. Não exponha as portas à internet.

## Conectar a câmera
No painel, informe o DID/ID e a senha configurada no V360 Pro. O campo de tipo inicia em 43 porque esse é o tipo de referência do projeto de compatibilidade. O tipo real do modelo CMIP-01/FH8626V1 ainda não foi confirmado e pode ser diferente.

A primeira negociação PPCS pode precisar que a câmera tenha acesso à internet. O SDK do fabricante é proprietário. A implementação usa uma biblioteca extraída do APK que o próprio usuário seleciona; nenhum binário proprietário é armazenado no GitHub.

## Execução no PC
Com Android conectado por USB e Depuração USB habilitada, faça:

~~~~bash
adb forward tcp:8766 tcp:8766
~~~~

Depois instale Node.js, Python 3 e FFmpeg no PC e execute os mesmos comandos npm install, npm run build e python bridge/ppcs_server.py. Abra http://127.0.0.1:8787.

## Código PPCS de referência
A camada PPCS e a ponte Android foram adaptadas de GainSec/Super-Awesome-AI-Driver, sob licença MIT. O aviso de licença está em LICENSES/GAINSEC-SAAD-MIT.txt.

## Limitação conhecida
O projeto de referência foi testado em um equipamento V360 Pro camera-car, tipo 43. A sua câmera é um modelo panorâmico fixo com firmware V31978.1.33.20260608 e chipset FH8626V1. A família do app/SDK é compatível em princípio, mas a sessão e o formato de vídeo ainda precisam ser testados no aparelho real. Não afirmamos que a transmissão da sua câmera já foi confirmada.
