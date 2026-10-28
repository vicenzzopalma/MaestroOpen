# Referência de compatibilidade: Maestri 0.23.1

Esta referência fixa o alvo usado para medir paridade. Ela evita que “idêntico” dependa de memória visual ou de suposições e não incorpora código nem assets proprietários.

## Identidade observada

- Aplicativo: Maestri 0.23.1 para Windows
- Build: `90`
- Commit informado pelo aplicativo: `f956f09cfe034e58d464ca99c634949e6c00d621`
- Data do build: `2026-10-13T02:12:49.838Z`
- SHA-256 de `resources/app.asar`: `31CD5206C303C7326738190BE7434E7CE8D50F78ED661C8F4F23B30007B6218B`
- CLI de referência: executável Swift nativo `resources/cli/maestri.exe`

## Evidência REA

O `app.asar` foi analisado localmente com REA 6.4.0. Para reduzir ruído, o segundo passe considerou apenas os 186 artefatos de `out/main`, `out/preload` e `out/renderer`.

- Evidence ID: `ev_d9dcb276fc2e8672dd43842b282b48cad47be1b1441b8d63690d2432398e83c5`
- Digest SHA-256 da árvore `out`: `608e7cc44b7ae5c5aa8ebd03e083dd6aa855181f9e25002ef3f424d5d56fa88a`
- Resultado estrutural: processos Electron main/preload/renderer, dois workers, canais IPC e endpoints foram reconstruídos pelo analisador.

O manifesto do aplicativo confirma React 19, Jotai, CodeMirror 6, Mermaid 12, Radix UI, XTerm, `node-pty` e Electron. A implementação aberta mantém os mesmos limites de processo e usa versões estáveis fixadas no lockfile.

## Superfície do CLI observada

O contrato funcional inclui:

- Raiz: `list`, `notify`, `ask`, `check`, `say`, `recall`, `recruit`, `dismiss`, `connect` e `debug`.
- Notas: `create`, `read`, `write`, `edit`, `stack`, `unstack` e `delete`.
- Portals web e Android: `devices`, `create`, `edit`, `close`, `navigate`, `snapshot`, `a11y`, `screenshot`, `click`, `tap`, `fill`, `type`, `key`, `selectall`, `clear`, `hover`, `focus`, `select`, `check`, `uncheck`, `scroll`, `scrollintoview`, `drag`, `swipe`, `button`, `home`, `lock`, `launch`, `terminate`, `text`, `wait`, `html`, `evaluate`, `logs-start`, `logs`, `info`, `resize` e `ua`.
- Presets: `list`, `show`, `create`, `set` e `delete`.
- Roles: `list`, `show`, `create`, `write`, `edit`, `assign` e `delete`.
- Routines: `list`, `show`, `create`, `edit`, `enable`, `disable`, `run` e `delete`.
- Workspaces: `create`, `rename`, `move` e `list`.
- Floors: `create`, `list`, `land`, `delete`, `status` e `unload`.

As assinaturas relevantes também ficam congeladas: `portal type` recebe texto para o elemento em foco; `portal check` aceita alvo opcional; `portal edit --url` é opcional; `ask` aceita `--batch` e `--raw`; `recall` aceita intervalos por turnos, período ou datas.

## Regra de evolução

Cada entrega deve atualizar a matriz em `docs/PARITY.md`. Uma linha só recebe estado **implementado** depois de possuir comportamento executável e uma verificação correspondente. Comandos reservados no parser continuam marcados como **contrato**, para que uma árvore de ajuda completa não seja confundida com paridade funcional.

