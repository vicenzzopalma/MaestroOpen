# Maestri Open Desktop

Base multiplataforma, local-first e sem assinatura para um canvas de terminais e agentes. Esta primeira etapa entrega Electron + Vite + React 19, IPC isolado, descoberta de shells, gerenciamento inicial de PTY, persistência JSON atômica e a superfície compatível dos CLIs `maestri`/`omaestri`.

## Requisitos

- Node.js 22.12 ou superior
- npm 10 ou superior
- Windows: os binários N-API incluídos em `node-pty` são usados por padrão; Visual Studio Build Tools com Desktop development with C++ e bibliotecas Spectre são necessários apenas para `npm run rebuild:native`
- Linux: toolchain C/C++, Python e headers usuais do Node

## Desenvolvimento

```bash
npm install
npm run dev
```

Validação e empacotamento:

```bash
npm run typecheck
npm run build
npm run dist:dir
```

Consulte [a arquitetura](docs/ARCHITECTURE.md) e [o contrato de paridade](docs/PARITY.md).
