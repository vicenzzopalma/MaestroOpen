# Contrato de paridade com Maestri

Esta lista transforma “interface idêntica” em critérios verificáveis. O visual será calibrado com capturas autorizadas do produto; o comportamento abaixo já faz parte do contrato.

| Área | Paridade exigida | Melhoria prevista |
| --- | --- | --- |
| Canvas | pan, zoom, grade, draw-to-create, seleção, lock, minimize, resize | culling, rAF, zoom ancorado, seleção múltipla |
| Nós | Terminal, Note, File Tree, Portal e Text | Diff, runner e visualizadores extensíveis |
| Cabos | conexão visual e comunicação entre agentes | agrupamento, activity pulse e inspeção de tráfego |
| Sidebar | workspaces, grupos, pastas, floors e status | busca rápida e indicadores agregados |
| Terminal | presets, papel, aparência, atenção e contas | PowerShell/CMD/WSL/bash/zsh e restore confiável |
| Floors | Ground, worktrees, cópias, status, land e PR | implementação multiplataforma com validações transacionais |
| CLI | comandos e opções `maestri`; alias `omaestri` | JSON-RPC local autenticado e respostas estruturadas opcionais |
| Persistência | `workspace.json`, `schemaVersion: 2` | escrita atômica, backup e migrações idempotentes |

Referências de produto consultadas em 13 de outubro de 2026:

- Documentação oficial do canvas: https://www.themaestri.app/en/docs/canvas
- Documentação oficial de terminais: https://www.themaestri.app/en/docs/terminals
- Documentação oficial de floors: https://www.themaestri.app/en/docs/floors
- Referência pública de compatibilidade: https://github.com/pedrotecinf/open-maestri

Não serão copiados logotipos, nomes comerciais exclusivos ou assets proprietários sem licença. A paridade cobre layout, fluxos, formatos e comandos necessários à interoperabilidade.
