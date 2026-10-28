# PROMPT DE AUDITORIA E REFINAMENTO ARQUITETURAL PARA O AGENTE ARGON
**Alvo:** Auditoria, Paridade de Engenharia Reversa e Evolução do `Maestri-Open`  
**Base de Código Anexada:** `monstro.txt` (código-fonte integral e unificado de 38 arquivos do projeto)  
**Referência Alvo de Paridade:** Maestri Desktop 0.23.1 (Build 90)

---

## 🎯 MISSÃO DO ARGON

Você atuará como **Auditor de Software Sênior, Especialista em Engenharia Reversa de Aplicações Electron e Engenheiro Chefe de Sistemas Multiagente**.

Sua missão é realizar uma **auditoria profunda, rigorosa e prática** sobre o código-fonte integral presente em `monstro.txt`, identificando todas as falhas, limitações arquiteturais e discrepâncias visuais/funcionais em relação ao software original **MAESTRI**, propondo correções completas e prontas para implementação.

O projeto atual falhou em entregar a experiência esperada nos testes práticos do usuário:
1. **Interface amadora ("de menino de ensino médio"):** Longe do design sofisticado, escuro, minimalista e milimetricamente calibrado do Maestri original.
2. **Desconexão funcional entre agentes:** Os agentes nos terminais não reconhecem dinamicamente que estão interligados pelos cabos do canvas; não há transmissão de contexto vivo entre eles.
3. **Impossibilidade de acoplar prompts de identidade (Personas):** Terminais não sustentam identidades e diretrizes de forma transparente e acoplada ao shell/runtime do agente.
4. **Mecanismo de "Loop de Pensamento com Timer Fixo" incompleto:** A premissa central é que o usuário estipula uma meta e um horário de término (ex: 18h). Mesmo que a IA considere que terminou a tarefa no primeiro ciclo, ela **NÃO pode parar**; deve entrar em ciclo contínuo de pensamento, auto-revisão, testes cruzados com agentes conectados e refinamento sucessivo até o prazo estipulado.

---

## 📋 ESCOPO DA AUDITORIA

### 1. AUDITORIA DA INTERFACE E PARIDADE VISUAL (UI/UX)
Com base nas descobertas de engenharia reversa do REA (`analysis/rea-findings.md`) e no `App.tsx` / `styles.css`:
- **Canvas Infinito & Grid:** Avaliar a física do canvas, o grid quadriculado (tamanho, cor, espaçamento), o zoom ancorado no cursor do mouse (`zoom-to-cursor`), e o culling de nós fora da viewport.
- **Top Toolbar Flutuante:** O Maestri original possui uma barra central superior com: Seleção (`MousePointer`), Terminal (`Command`), Nota (`FilePlus2`), Anexar (`Paperclip`), Árvore de Arquivos (`FolderTree`), Portal Web/Android (`Globe2`), Texto (`Type`) e Desenhar (`PenTool`). Analise o alinhamento, microinterações, estados ativos e atalhos de teclado.
- **Cartões de Nós (Terminais e Notas):**
  - Avaliar bordas, cantos arredondados, contrastes escuros profundos (tons HSL específicos vs. pretos genéricos).
  - Terminal card com abas ou titlebar minimalista, status dot pulsante (ativo, ocupado, atenção, erro), resize handles nos 4 cantos e bordas, e integração XTerm fluida com GPU WebGL Addon.
  - Cabo de Conexão SVG: Curvatura de Bézier cúbica real, cálculo correto das âncoras (portas de entrada/saída laterais dos cartões), animação de pulso de dados transmitidos e detecção de nós conectados.
- **Sidebar & Footer:**
  - Sidebar de 260px com busca rápida, lista de Workspaces colapsáveis, contadores e atalhos rápidos.
  - Barra inferior (Bottom Bar) com alternador de Andares (Floors: Ground/Térreo, Worktrees isoladas), controle de Zoom numérico/slider e Minimapa real funcional.

### 2. TOPOLOGIA DE REDE E INTERCOMUNICAÇÃO MULTIAGENTE
Analise `src/main/automation/server.ts`, `src/main/automation/loop-manager.ts` e `src/cli/index.ts`:
- **Por que os agentes não sabem quem está conectado a eles?**
  - Como os cabos do canvas devem atualizar automaticamente o arquivo de contexto e variáveis de ambiente dos terminais em tempo real (`MAESTRI_CONNECTIONS`, `.maestri/context.json` ou chamada dinâmica via `maestri context`)?
  - Audite os comandos `maestri list`, `maestri ask <Agente> "<msg>"`, `maestri check <Agente>` e `maestri notify`.
  - Como garantir que quando o Agente "Lead" manda mensagem pro "Frontend", a mensagem chegue de imediato via buffer de PTY ou injeção no ciclo atual do agente?
- **Protocolo de Mensageria Inter-Processos:**
  - Avalie a comunicação via JSON-RPC sobre Named Pipes (`\\.\pipe\maestri-...` no Windows) e Unix Sockets no Linux/macOS. O token efêmero de autenticação e os limites de buffer estão seguros e sem gargalos?

### 3. ACOPLAMENTO DE IDENTIDADES E PERSONAS (ROLES)
Analise como o `role` é persistido e injetado:
- Como fazer com que a identidade (ex: "Engenheiro Frontend especializado em Tailwind e React") seja:
  1. Fixada no terminal de forma resiliente mesmo após comandos de shell do usuário.
  2. Injetada como System Prompt ou Instruction Header nos principais runtimes de agentes do mercado:
     - **Claude Code** (via flags de system prompt / CLAUDE.md ou arguments)
     - **Codex CLI** (via instruction files / prompts empacotados)
     - **Gemini CLI / Aider / OpenCode**
  3. Visualizada e editável diretamente no card do terminal ou no painel lateral de forma elegante.

### 4. MOTOR DE RACIOCÍNIO CONTÍNUO EM LOOP COM TIMER (O "MAESTRO TIME")
Analise a fundo `src/main/automation/loop-manager.ts`:
- **O Problema da Conclusão Prematura:** As IAs modernas encerram a resposta quando resolvem o prompt imediato ("Concluí a tarefa!").
- **A Solução Reversa do Maestri:** Como estruturar o **Supervisor de Ciclos**:
  - Quando um ciclo termina com código 0 (sucesso) ou resposta terminada, o supervisor NÃO encerra o processo se o horário atual for inferior ao `deadline`.
  - Em vez disso, o supervisor incrementa o ciclo (`Ciclo N+1`), calcula o tempo restante (`X minutos restantes`) e injeta o meta-prompt de auto-refinamento:
    - *"Você concluiu a etapa anterior, mas o prazo de refinamento é até [HORÁRIO]. NÃO pare. Seu dever agora é: 1) Testar exaustivamente procurando corner-cases; 2) Validar com as notas e contratos dos nós conectados; 3) Refatorar código duplicado; 4) Escrever testes automatizados; 5) Se comunicar com seus colegas conectados via `maestri ask` para validação cruzada. Prossiga no refinamento."*
  - Tratamento de Falhas e Backpressure: Se o agente der erro, o que acontece? Se houver estouro de contexto, como truncar com segurança mantendo os últimos resumos de raciocínio?
  - Gestão de Processos no Windows: Uso correto de árvore de processos (`taskkill /T /F` ou `tree-kill`) para não deixar processos zumbis rodando em background ao parar o loop.

### 5. ANÁLISE DE PROJETOS OPEN-SOURCE DE REFERÊNCIA
Pesquise e confronte a arquitetura atual com projetos que tiveram sucesso em engenharia reversa e orquestração de agentes locais:
- **open-maestri (pedrotecinf/open-maestri):** O que esse projeto de compatibilidade implementou que falta aqui?
- **Aider / SWE-agent:** Como eles estruturam o loop de reflexão, leitura de repositório e edição com feedback contínuo?
- **ChatDev / MetaGPT:** Como modelam a troca de mensagens ponto a ponto entre papéis de software?
- **Ghostty / Alacritty / Hyper / VSCode Terminal:** Como gerenciam estabilidade de `node-pty`, redimensionamento e xterm com alta performance?

---

## 📤 FORMATO DA RESPOSTA DO ARGON

O Argon deve entregar a auditoria estruturada rigorosamente nos seguintes tópicos:

1. **DIAGNÓSTICO EXECUTIVO:** Resumo das 5 maiores causas de falha do código atual (por que a UI parece amadora, por que a conexão entre agentes falha, por que o timer não sustenta o loop de reflexão).
2. **AUDITORIA TÉCNICA DETALHADA:** Apontamento linha por linha dos arquivos em `monstro.txt` que contêm bugs, race conditions, vazamento de PTY ou inconsistências de dados.
3. **BLUEPRINT DE DESIGN E PARIDADE VISUAL (UI/UX MAESTRI):**
   - Paleta de cores exata, tokens CSS, componentes e layouts necessários para transformar a interface em um clone perfeito e premium do Maestri 0.23.1.
   - Especificação do comportamento dos cabos SVG, nós flutuantes, floating toolbar e bottom bar.
4. **ARQUITETURA DE REDE DE AGENTES E INJEÇÃO DE IDENTIDADE:**
   - Como implementar o canal de broadcast/unilink entre agentes conectados.
   - Código exato do mecanismo de injeção de persona nos terminais.
5. **MOTOR DE LOOP CONTÍNUO (REFINAMENTO TEMPORAL SUPERVISIONADO):**
   - Refatoração completa e código pronto para o `LoopManager` que mantenha a IA pensando e refinando até o segundo exato estipulado pelo usuário.
6. **PLANO DE AÇÃO IMEDIATO DE IMPLEMENTAÇÃO:** Checklist ordenado de tarefas para os agentes executores aplicarem no repositório.
