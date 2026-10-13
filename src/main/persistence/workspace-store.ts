import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { workspaceSchema, type WorkspaceDocument } from '../../shared/contracts'

export class WorkspaceStore {
  constructor(private readonly filePath: string) {}

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

  async save(input: WorkspaceDocument): Promise<void> {
    const workspace = workspaceSchema.parse({ ...input, updatedAt: new Date().toISOString() })
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporaryPath = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify(workspace, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, this.filePath)
  }

  async update(
    change: (workspace: WorkspaceDocument) => WorkspaceDocument | Promise<WorkspaceDocument>
  ): Promise<WorkspaceDocument> {
    const next = await change(await this.load())
    await this.save(next)
    return next
  }
}
