# Sentinela AI

Painel web para monitoramento e análise local de vídeo.

## O que está implementado
- Interface responsiva hospedada na Vercel.
- Entrada por arquivo e câmera local do navegador.
- Ponte local para receber uma fonte RTSP/HTTP ou câmera conectada ao mesmo dispositivo.
- Diagnóstico TCP básico no IP da câmera para procurar portas comuns de RTSP.
- Transmissão MJPEG da ponte para a interface local.
- Detecção simples de movimento e eventos no dispositivo que executa a ponte.

## Executar a ponte local

É necessário Node.js/npm e Python 3 no mesmo computador que abrirá o painel.

~~~~bash
npm install
npm run build
python -m pip install -r bridge/requirements.txt
python bridge/server.py
~~~~

Abra http://127.0.0.1:8787. A ponte escuta somente em loopback por padrão. O vídeo não é enviado à Vercel nem armazenado na nuvem.

No painel, teste o IP local e depois informe a URL RTSP/HTTP válida, caso o firmware ofereça uma. Exemplo ilustrativo:

~~~~text
rtsp://192.168.0.2:554/caminho-da-stream
~~~~

O endereço acima não foi confirmado para esta câmera. O caminho depende do fabricante e pode exigir habilitação de RTSP/ONVIF.

## Limitação V360 Pro / FH8626V1

A análise estática do APK V360 Pro revelou referências ao SDK proprietário PPCS/P2P. Até agora, não foi confirmado um endpoint RTSP/ONVIF público nem concluído um cliente independente com sessão autenticada para essa câmera. Portanto, esta versão não afirma que a V360 já está conectada diretamente.

O diagnóstico testa apenas portas TCP comuns. Se não houver RTSP/ONVIF, a próxima etapa é implementar um adaptador Android autorizado usando a sessão iniciada pelo próprio V360 Pro, ou localizar uma opção oficial de stream no firmware. A ponte já resolve o transporte local até o painel.

## Privacidade
- A ponte fica em 127.0.0.1 por padrão.
- Vídeo e análise permanecem no dispositivo local.
- Credenciais RTSP não são persistidas em arquivo nem incluídas nos logs.
- Não exponha o servidor em redes públicas.
