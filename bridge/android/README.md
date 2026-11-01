# Sentinela AI · PPCS Android Bridge

Este app mantém a biblioteca nativa PPCS do V360 Pro carregada e abre uma ponte TCP apenas em 127.0.0.1:8766.

## APK pronto
A cada alteração no código, o workflow **Build Sentinela PPCS Bridge APK** gera o artefato **sentinela-ppcs-bridge-debug**. Baixe o APK na aba Actions do GitHub. O APK não inclui a biblioteca proprietária da câmera.

## Configurar no Android
1. Instale app-debug.apk.
2. Abra Sentinela AI PPCS Bridge.
3. Toque em Selecionar APK do V360 Pro e escolha o APK V360 Pro original.
4. Aguarde a mensagem PPCS Bridge ativo em 127.0.0.1:8766.

A biblioteca libPPCS_API.so é extraída do APK escolhido para o armazenamento privado deste app. Ela não é enviada à nuvem nem incluída no repositório.

## Uso
No mesmo Android, execute o backend Python no Termux:

~~~~bash
pkg install git nodejs python ffmpeg
git clone https://github.com/lnzindev/Minecraft-WebLab.git
cd Minecraft-WebLab
npm install
npm run build
python bridge/ppcs_server.py
~~~~

Abra http://127.0.0.1:8787 no navegador do mesmo aparelho.

Se o Python rodar em um computador, faça adb forward tcp:8766 tcp:8766 com o Android conectado por USB, e inicie o backend Python no PC.

## Segurança
A ponte PPCS escuta somente em loopback (127.0.0.1), sem acesso pela rede local. Mantenha o app de ponte aberto durante o monitoramento.
