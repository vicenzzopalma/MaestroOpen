# Arquitetura do Maestri Open Desktop

## Objetivo de compatibilidade

O produto preserva a superfície do Maestri: canvas infinito, barra lateral de workspaces e floors, toolbar de criação, cartões de terminal/nota/portal/arquivos, conexões, minimapa, indicadores de atividade e os executáveis `maestri` e `omaestri`. A implementação é multiplataforma e local, com Electron, React e PTYs reais.

O formato persistido começa em `schemaVersion: 2` para manter uma rota de importação e exportação compatível. Migrações futuras devem ser aditivas e conservar campos desconhecidos quando um documento é regravado.

## Processos

```text
CLI maestri/omaestri ── JSON-RPC ── named pipe / Unix socket
                                      │
Electron main ── PTY manager ── PowerShell, CMD, WSL, bash, zsh
      │
      ├── workspace store (gravação JSON atômica)
      ├── automation server
      └── IPC tipado e isolado
              │
           preload
              │
React renderer ── Jotai ── Canvas / Nodes / Connections
```

O renderer nunca recebe acesso direto a Node. O preload expõe somente métodos tipados. `node-pty`, arquivos, sockets, chaves e processos permanecem no main process.

## Estrutura

```text
src/
  main/
    index.ts                 ciclo de vida Electron e BrowserWindow
    ipc/                     handlers renderer ↔ main
    pty/                     descoberta de shells e sessões PTY
    persistence/             documentos e gravação atômica
    automation/              servidor JSON-RPC local
  preload/index.ts           ponte segura e pequena
  renderer/
    index.html
    src/
      components/            canvas e cartões nas próximas etapas
      state/                 átomos Jotai por domínio
  cli/index.ts               CLI compatível, também publicado como omaestri
  shared/                    schemas Zod e contratos compartilhados
```

## Regras de desempenho do canvas

- Posições são persistidas em coordenadas do mundo; pan e zoom ficam em estado transitório.
- Eventos de ponteiro atualizam refs e desenham no máximo uma vez por `requestAnimationFrame`.
- O Jotai recebe apenas commits de interação, normalmente no início e no fim de um drag.
- Cartões fora da viewport, mais uma margem de prefetch, são desmontados ou reduzidos a placeholders.
- Cabos usam uma camada SVG única; hit testing e animação não provocam render de todos os cartões.
- O ponto sob o cursor permanece fixo durante o zoom.
- Scroll dentro de terminal, nota ou portal pertence ao cartão; zoom usa gesto explícito quando o ponteiro está sobre conteúdo rolável.

## Compatibilidade CLI planejada

A árvore de comandos já está reservada no CLI para evitar quebra de scripts:

- `list`, `ask`, `check`, `say`, `recall`, `debug`, `notify`, `recruit`, `dismiss`, `connect`
- `note create|read|write|edit|stack|unstack|delete`
- `preset list|show|create|set|delete`
- `role list|show|create|edit|write|assign|delete`
- `portal create|edit|close|devices` e todos os verbos de automação web/Android
- `floor create|list|land|delete|status|unload`
- `workspace create|list|move|rename`
- `routine list|show|create|edit|enable|disable|run|delete`

Os dois nomes de binário apontam para o mesmo código. A aplicação grava um descritor em `~/.maestri/runtime.json`; o cliente autentica cada chamada JSON-RPC por um token efêmero e conversa somente por pipe/socket local. `MAESTRI_PIPE` e `MAESTRI_AUTOMATION_ENDPOINT` podem substituir o endereço do descritor. Terminais criados pelo canvas recebem `MAESTRI_TERMINAL_ID`; `maestri list` usa esse ID para mostrar apenas os nós ligados ao terminal atual. Recrutamento via CLI cria o PTY e seu cartão no workspace, e alterações externas são enviadas ao renderer por IPC.

## Melhorias mantidas sem quebrar a experiência

- Buffer circular por terminal para comandos longos e leitura headless.
- Sessões isoladas por janela e encerramento determinístico ao fechar a janela.
- Gravação em arquivo temporário seguida de rename atômico.
- CSP, `contextIsolation`, sandbox e `nodeIntegration: false` desde o primeiro build.
- Status de agente em quatro estados: ativo, ocioso, atenção e encerrado.
- Navegação por teclado, zoom-to-fit, seleção múltipla e restauração de viewport serão implementados como comportamentos de primeira classe.

## Etapas seguintes

1. Fechar o servidor JSON-RPC e os métodos da CLI contra testes de contrato.
2. Implementar canvas com pan/zoom, seleção, culling e persistência.
3. Integrar XTerm, resize síncrono e restauração de scrollback.
4. Adicionar CodeMirror, preview Markdown/Mermaid e anexos locais.
5. Implementar portals, file tree, floors/worktrees e rotinas.
6. Adicionar provedores BYOK e locais por adaptadores, com segredos no cofre do sistema.
