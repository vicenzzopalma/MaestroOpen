import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const home = os.homedir()

const skillContent = `---
name: orchestration
description: >-
  Coordena trabalhadores supervisionados do Orca/Maestri: mensagens encadeadas,
  bloqueio de perguntas/respostas (ask/reply), despacho de tarefas, espera de
  conclusão/escalonamento de trabalhadores, DAGs de tarefas, gates de decisão,
  loops de coordenador e decomposição de trabalho entre agentes. Toda a comunicação
  e orquestração é realizada estritamente em Português (pt-BR).
---

# Orquestração Orca (Orchestration) - Português

Esta skill habilita a orquestração estruturada de múltiplos agentes: mensagens com threads,
fluxos de solicitação/resposta com bloqueio (ask/reply), despacho de tarefas em paralelo,
espera por conclusão/escalonamento de agentes subordinados, DAGs de tarefas, gates de decisão,
loops contínuos de coordenação e decomposição de escopos complexos entre múltiplos trabalhadores.

## Diretriz de Idioma Mandatória (Português - pt-BR)
- **Todas as comunicações:** Respostas ao usuário, prompts disparados aos subagentes, logs de ciclo, resumos e mensagens de handoff DEVEM ser emitidos em Português (pt-BR).
- **Terminologia técnica:** Mantenha termos canônicos de código e comandos (ex: \`build\`, \`commit\`, \`PR\`, \`endpoint\`, \`DAG\`), mas toda a narrativa e coordenação devem ser em Português claro e profissional.

## Resolução do CLI para esta sessão

Escolha o executável uma vez e reutilize em todos os comandos subsequentes:

1. Se a variável de ambiente \`ORCA_CLI_COMMAND\` estiver definida, utilize seu valor.
2. Em um ambiente de desenvolvimento cujo repositório exponha \`ORCA_DEV_REPO_ROOT\`, utilize \`orca-dev\`.
3. No Linux fora de um terminal gerenciado pelo Orca, utilize \`orca-ide\`. Nunca execute \`orca\` puro no Linux fora dos terminais gerenciados pelo Orca para evitar conflito com o leitor de tela do sistema.
4. No Windows / macOS ou dentro do terminal gerenciado, utilize \`orca\` ou \`maestri\`.

Nas instruções abaixo, \`ORCA\` representa o executável resolvido.

## Guia de Execução e Comandos

Para obter o guia correspondente à versão instalada do binário:
\`\`\`text
ORCA skills get orchestration
\`\`\`

Para listar referências adicionais de execução:
\`\`\`text
ORCA skills get orchestration --references
\`\`\`

Para carregar uma referência específica (ex: gates de decisão, trabalho remoto ou recuperação de release):
\`\`\`text
ORCA skills get orchestration --reference references/<arquivo>.md
\`\`\`

Caso o binário não suporte \`--reference\`, execute:
\`\`\`text
ORCA skills get orchestration --full
\`\`\`

## Práticas de Orquestração com Subagentes

1. **Decomposição Clara de Tarefas:**
   - Ao delegar trabalho para outros terminais ou subagentes, divida em entregáveis modulares (ex: frontend, backend, auditoria).
   - Defina critérios de aceitação e prazos claros para cada subordinado.

2. **Mensagens Assíncronas e Bloqueios:**
   - Utilize mensagens com contexto completo: objetivo da tarefa, arquivos relevantes e restrições.
   - Aguarde o término do trabalhador antes de avançar para nós dependentes na árvore de tarefas (DAG).

3. **Loops de Refinamento (Maestro Time):**
   - Caso o objetivo demande persistência com prazo fixo, mantenha o ciclo ativo até o horário estipulado, exigindo auditorias e testes incrementais a cada ciclo.

4. **Retorno Consolidado:**
   - Consolide as saídas de todos os trabalhadores em um resumo executivo em Português para o usuário final.
`

const targets = [
  path.join(home, '.agents', 'skills', 'orchestration'),
  path.join(home, '.gemini', 'config', 'skills', 'orchestration')
]

for (const dir of targets) {
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'SKILL.md'), skillContent, 'utf8')
  console.log('Salvo em:', path.join(dir, 'SKILL.md'))
}
