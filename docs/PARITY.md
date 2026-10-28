# Contrato de paridade com Maestri

Esta lista transforma “interface idêntica” em critérios verificáveis. O alvo está congelado em [Maestri 0.23.1](reference/MAESTRI-0.23.1.md). O visual será calibrado contra essa versão e o comportamento será promovido de contrato para implementado somente após validação.

| Área | Estado nesta entrega | Paridade exigida | Melhoria prevista |
| --- | --- | --- | --- |
| Shell desktop | **implementado** | Electron, janela única e preload isolado | CSP e ciclo de encerramento determinístico |
| PTY backend | **implementado inicial** | processo real, streaming, input, resize, leitura e kill | restauração e backpressure adaptativo |
| Canvas | **contrato + mock visual** | pan, zoom, grade, draw-to-create, seleção, lock, minimize, resize | culling, rAF, zoom ancorado, seleção múltipla |
| Nós | **contrato** | Terminal, Note, File Tree, Portal e Text | Diff, runner e visualizadores extensíveis |
| Cabos | **contrato** | conexão visual e comunicação entre agentes | agrupamento, activity pulse e inspeção de tráfego |
| Sidebar | **contrato + mock visual** | workspaces, grupos, pastas, floors e status | busca rápida e indicadores agregados |
| Terminal | **backend implementado** | presets, papel, aparência, atenção e contas | PowerShell/CMD/WSL/bash/zsh e restore confiável |
| Floors | **contrato CLI** | Ground, worktrees, cópias, status, land e PR | implementação multiplataforma com validações transacionais |
| CLI | **parser completo; núcleo executável** | comandos e opções `maestri`; alias `omaestri` | JSON-RPC local autenticado e respostas estruturadas opcionais |
| Persistência | **implementado inicial** | `workspace.json`, `schemaVersion: 2` | escrita atômica, backup e migrações idempotentes |

Referências de produto consultadas em 14 de outubro de 2026:

- Documentação oficial do canvas: https://www.themaestri.app/en/docs/canvas
- Documentação oficial de terminais: https://www.themaestri.app/en/docs/terminals
- Documentação oficial de floors: https://www.themaestri.app/en/docs/floors
- Referência pública de compatibilidade: https://github.com/pedrotecinf/open-maestri
- Ferramenta de análise estática usada: https://github.com/morluto/rea/blob/main/docs/readme/README_pt-BR.md

Não serão copiados logotipos, nomes comerciais exclusivos ou assets proprietários sem licença. A paridade cobre layout, fluxos, formatos e comandos necessários à interoperabilidade.


## Atualização: identidades e supervisor

Implementados: painel de identidade e prazo, CLI de identidades, contexto dos nós conectados, conexão automática ao recrutar, CLI isolado por aplicativo, ciclos Codex sequenciais, fila de mensagens por ciclo, parada manual e por prazo, erros visíveis e gravações JSON serializadas.

Validados: build completo, testes do supervisor com processos simulados e integração do painel em Electron isolado. Não foi executada uma sessão paga de refinamento com o modelo real durante os testes. O visual do painel foi inspecionado por captura de tela; a equivalência visual integral ao original ainda não foi estabelecida.
