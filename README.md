# Sentinela AI

Painel web para monitoramento e análise local de vídeo.

## Implementado
- Painel responsivo hospedado na Vercel.
- Entrada por arquivo e câmera local do navegador.
- Ponte local para receber uma transmissão RTSP/HTTP.
- Diagnóstico TCP básico no IP da câmera para procurar portas comuns de RTSP.
- Conversão de RTSP/HTTP para MJPEG com FFmpeg e exibição no painel local.
- Detecção simples de movimento no navegador local e feed de eventos.

## Executar a ponte local

Instale Node.js/npm, Python 3 e FFmpeg no mesmo dispositivo que abrirá o painel.

~~~~bash
npm install
npm run build
python bridge/server.py
~~~~

Abra http://127.0.0.1:8787. A ponte escuta somente em loopback por padrão. O vídeo e a análise permanecem no dispositivo local; não são enviados à Vercel.

No painel, teste o IP e informe uma URL RTSP/HTTP válida, caso o firmware ofereça uma. Exemplo ilustrativo:

~~~~text
rtsp://192.168.0.2:554/caminho-da-stream
~~~~

O endereço acima não foi confirmado para esta câmera. O caminho depende do fabricante e pode exigir habilitação RTSP/ONVIF.

### Termux (Android)

Com o repositório clonado no Termux:

~~~~bash
pkg update
pkg install git nodejs python ffmpeg
npm install
npm run build
python bridge/server.py
~~~~

Abra http://127.0.0.1:8787 no navegador do mesmo celular.

## Limitação V360 Pro / FH8626V1

A análise estática do APK V360 Pro revelou referências ao SDK proprietário PPCS/P2P. Até agora, não foi confirmado endpoint RTSP/ONVIF público nem concluído um cliente independente com sessão autenticada para essa câmera. Portanto, esta versão não afirma que a V360 já está conectada diretamente.

O diagnóstico testa portas TCP comuns. Se não houver RTSP/ONVIF, a próxima etapa é implementar um adaptador Android autorizado usando a sessão iniciada pelo próprio V360 Pro, ou localizar uma opção oficial de stream no firmware. A ponte já resolve a conversão e o transporte até o painel.

## Privacidade
- A ponte fica em 127.0.0.1 por padrão.
- Vídeo e análise permanecem no dispositivo local.
- Credenciais RTSP não são persistidas nem registradas em logs.
- Não exponha o servidor em redes públicas.
