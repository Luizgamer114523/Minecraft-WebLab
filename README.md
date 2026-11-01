# Sentinela AI

Painel web inicial para monitoramento e análise de vídeo.

## Estado do MVP
- Interface responsiva de monitoramento.
- Entrada de vídeo por arquivo ou câmera local do navegador.
- Detecção básica de movimento no navegador, sem enviar o vídeo para um servidor.
- Registro de eventos apenas durante a sessão atual.

## Limitação importante
A câmera Wi-Fi V360 Pro ainda não está conectada diretamente. O acesso direto depende de implementar a integração compatível com o protocolo/SDK do fabricante ou uma ponte local autorizada. O painel não simula uma conexão com ela.

## Desenvolvimento
```bash
npm install
npm run dev
```
