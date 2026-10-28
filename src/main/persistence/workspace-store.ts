import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { workspaceSchema, type WorkspaceDocument } from '../../shared/contracts'

export class WorkspaceStore {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly filePath: string) {}
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  async load(): Promise<WorkspaceDocument> {
    try {
      return workspaceSchema.parse(JSON.parse(await readFile(this.filePath, 'utf8')))
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return {
        schemaVersion: 2,
        id: randomUUID(),
        name: 'Meu Workspace',
        rootPath: process.cwd(),
        nodes: [],
        connections: [],
        updatedAt: new Date().toISOString()
      }
    }
  }

  save(input: WorkspaceDocument): Promise<void> {
    return this.enqueue(() => this.write(input))
  }

  private async write(input: WorkspaceDocument): Promise<void> {
    const workspace = workspaceSchema.parse({ ...input, updatedAt: new Date().toISOString() })
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.filePath)

    // Exporta o contexto vivo de rede para o diretório .maestri/ dentro do workspace do usuário
    try {
      if (workspace.rootPath) {
        const maestriDir = join(workspace.rootPath, '.maestri')
        await mkdir(maestriDir, { recursive: true })

        // 1. Grava team.json estruturado
        await writeFile(
          join(maestriDir, 'team.json'),
          JSON.stringify(
            {
              workspaceName: workspace.name,
              updatedAt: workspace.updatedAt,
              nodes: workspace.nodes.map((n) => ({
                id: n.id,
                title: n.title,
                type: n.type,
                role: n.data.role ?? '',
                content: n.data.content ?? ''
              })),
              connections: workspace.connections
            },
            null,
            2
          ),
          'utf8'
        )

        // 2. Grava context.md para que qualquer LLM leia as conexões imediatamente
        let contextMd = `# REDE DE AGENTES - MAESTRI\nWorkspace: ${workspace.name}\nÚltima atualização: ${workspace.updatedAt}\n\n`
        for (const node of workspace.nodes) {
          const connectedIds = new Set(
            workspace.connections
              .filter((c) => c.fromNodeId === node.id || c.toNodeId === node.id)
              .flatMap((c) => [c.fromNodeId, c.toNodeId])
          )
          const peers = workspace.nodes.filter((p) => p.id !== node.id && connectedIds.has(p.id))
          contextMd += `### [${node.type.toUpperCase()}] ${node.title}\n`
          if (node.data.role) contextMd += `- **Identidade/Role:** ${String(node.data.role)}\n`
          if (node.data.content) contextMd += `- **Conteúdo/Nota:**\n${String(node.data.content)}\n`
          contextMd += `- **Nós Conectados:** ${peers.map((p) => `${p.title} (${p.type})`).join(', ') || 'Nenhum'}\n\n`
        }
        await writeFile(join(maestriDir, 'context.md'), contextMd, 'utf8')

        // 3. Grava diretórios de roles .maestri/roles/<id>/
        const rolesDir = join(maestriDir, 'roles')
        await mkdir(rolesDir, { recursive: true })
        for (const node of workspace.nodes) {
          if (node.type === 'terminal') {
            const nodeRoleDir = join(rolesDir, node.id)
            await mkdir(nodeRoleDir, { recursive: true })
            await writeFile(
              join(nodeRoleDir, 'identity.md'),
              `# IDENTIDADE: ${node.title}\n${String(node.data.role ?? 'Agente sem identidade específica')}\n`,
              'utf8'
            )
          }
        }
      }
    } catch {
      // Ignora falhas se rootPath for inválido
    }
  }

  async update(
    change: (workspace: WorkspaceDocument) => WorkspaceDocument | Promise<WorkspaceDocument>
  ): Promise<WorkspaceDocument> {
    return this.enqueue(async () => {
      const next = await change(await this.load())
      await this.write(next)
      return next
    })
  }
}
