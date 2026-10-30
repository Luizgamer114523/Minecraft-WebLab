# Minecraft WebLab

Estudo de compatibilidade para executar a versão Android Minecraft Bedrock 1.26.60 em uma experiência acessível pelo navegador.

## Objetivo

Preservar o jogo original enviado para análise. Este projeto **não** deve apresentar um jogo voxel simplificado como se fosse uma conversão do Minecraft.

## Situação técnica

O APK enviado contém um motor nativo ARM64 (`libminecraftpe.so`) e dependências do Android, incluindo EGL/OpenGL ES e bibliotecas de áudio/rede. O navegador não executa APKs ou bibliotecas ELF Android diretamente.

O diagnóstico detalhado está em [docs/ANALISE-APK-26.60.md](docs/ANALISE-APK-26.60.md).

## Caminhos avaliados

- **Streaming do APK original:** executar o jogo em um host Android compatível e transmitir áudio/vídeo/controles para a página web. O frontend pode ficar na Vercel; o host do jogo precisa ser uma infraestrutura persistente separada.
- **Build web nativo:** requer código-fonte e pipeline de compilação autorizados para WebAssembly/WebGL/WebGPU.
- **Engine independente:** possível como projeto separado, mas não é a conversão do APK e não deve ser confundida com o objetivo principal.

## Regras do projeto

- Não publicar o APK, bibliotecas nativas ou recursos comerciais extraídos no repositório.
- Não alegar que o APK foi convertido sem uma execução verificável do jogo original.
- Não continuar o protótipo voxel simplificado anterior como se fosse o port solicitado.
- Registrar evidências, limitações e testes em `docs/`.

## Status

Análise estática inicial do APK 1.26.60 concluída. A execução original em navegador ainda não está implementada.