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

Consulte [a arquitetura](docs/ARCHITECTURE.md), [o contrato de paridade](docs/PARITY.md) e [a referência auditável do Maestri 0.23.1](docs/reference/MAESTRI-0.23.1.md).


## Identidades e refinamento com prazo

Abra **Identidade e timer** no cabeçalho de um terminal (ou o relógio na barra lateral).
Salve a identidade e use **Iniciar Codex no shell** com o PowerShell livre para iniciar uma sessão interativa com contexto de equipe.
Conecte os cartões pelos cabos. O contexto inclui nomes, identidades e notas diretamente conectadas.

Para trabalhar continuamente, informe o objetivo e a data/hora local de encerramento e clique em **Iniciar ciclos**.
O supervisor executa `codex exec` com escrita restrita ao workspace, fornece a identidade, as conexões e o resultado recente a cada ciclo.
Quando um ciclo termina com sucesso, outro começa após três segundos. O prazo encerra a árvore de processos em execução.
**Parar agora** cancela os próximos ciclos e interrompe o atual. Falhas interrompem a execução e aparecem no histórico.
Mantenha o aplicativo aberto; os ciclos não são retomados automaticamente depois de fechar o programa. O histórico é limitado à sessão atual.
O Codex deve estar instalado e autenticado. O modo contínuo usa um processo supervisionado próprio, separado da sessão interativa do cartão.

Os terminais recebem o CLI deste aplicativo no PATH. O endereço local e o descritor ficam separados do Maestri original (`.maestri-open/runtime.json`).

```powershell
maestri context
maestri role create Frontend "Cuide da interface, acessibilidade e integração."
maestri role assign "Terminal 2" Frontend
maestri recruit Backend --preset codex --role "Implemente e revise as APIs."
maestri connect Lead Backend
maestri list
maestri ask Backend "Revise o contrato da API."
maestri check Backend
maestri loop start Backend "Revise e refine a implementação existente" --until "2026-10-17T18:00:00-03:00"
maestri loop list
maestri loop stop Backend
```

`ask` confirma entrega, não espera a resposta. Em ciclos supervisionados, a mensagem entra na próxima revisão; `check` lê o histórico do supervisor.
Identidades nomeadas suportam `create`, `show`, `list`, `write`, `edit`, `assign` e `delete`.
A atribuição copia o texto da identidade para o terminal; editar a identidade nomeada depois requer nova atribuição.

### Validação desta implementação

- `npm run build`: TypeScript, renderer, main, preload e CLI.
- `node scripts/test-supervisor.mjs`: processos simulados para conclusão antecipada, repetição, mensagens, concorrência, falha, parada manual e prazo.
- `node scripts/test-agent-panel.mjs`: instância de teste do Electron com depuração em 9458; altera apenas o perfil de teste preparado para isso.

O adaptador contínuo implementado nesta versão é Codex. A paridade integral de portais embutidos, navegador de arquivos, floors e demais comandos reservados continua pendente; esta versão não deve ser descrita como réplica funcional completa.
