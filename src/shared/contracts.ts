import { z } from 'zod'

export const nodeFrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive()
})

export const canvasNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['terminal', 'note', 'portal', 'fileTree', 'text']),
  title: z.string(),
  frame: nodeFrameSchema,
  zIndex: z.number().int(),
  minimized: z.boolean().default(false),
  locked: z.boolean().default(false),
  data: z.record(z.string(), z.unknown()).default({})
})

export const portSideSchema = z.enum(['top', 'bottom', 'left', 'right'])
export type PortSide = z.infer<typeof portSideSchema>

export const connectionSchema = z.object({
  id: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  color: z.string().optional(),
  fromSide: portSideSchema.optional(),
  toSide: portSideSchema.optional()
})

export const workspaceSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string(),
  roles: z.record(z.string(), z.string()).optional(),
  nodes: z.array(canvasNodeSchema),
  connections: z.array(connectionSchema),
  updatedAt: z.string()
})

export type WorkspaceDocument = z.infer<typeof workspaceSchema>

export type ShellDescriptor = {
  id: string
  name: string
  executable: string
  args: string[]
  kind: 'powershell' | 'cmd' | 'bash' | 'zsh' | 'wsl' | 'other'
}

export type CreateTerminalRequest = {
  id?: string
  title: string
  cwd: string
  shellId?: string
  command?: string
  cols?: number
  rows?: number
  env?: Record<string, string>
}

export type TerminalCreated = {
  id: string
  pid: number
  shell: ShellDescriptor
}

export type TerminalDataEvent = { id: string; data: string }
export type TerminalExitEvent = { id: string; exitCode: number; signal?: number }

export type LoopState = {
  nodeId: string
  status: 'running' | 'stopped' | 'expired' | 'error'
  deadline: string
  cycle: number
  output: string
  error?: string
}

export interface MaestriDesktopApi {
  automation(method: string, params?: Record<string, unknown>): Promise<unknown>
  loopStart(nodeId: string, prompt: string, deadline: string): Promise<LoopState>
  loopStop(nodeId: string): Promise<void>
  loopList(): Promise<LoopState[]>

  getAppInfo(): Promise<{ version: string; platform: string; automationEndpoint: string }>
  listShells(): Promise<ShellDescriptor[]>
  createTerminal(request: CreateTerminalRequest): Promise<TerminalCreated>
  writeTerminal(id: string, text: string): Promise<void>
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>
  readTerminal(id: string, lines?: number): Promise<string>
  killTerminal(id: string): Promise<void>
  onTerminalData(listener: (event: TerminalDataEvent) => void): () => void
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
  onWorkspaceChanged(listener: (workspace: WorkspaceDocument) => void): () => void
  loadWorkspace(): Promise<WorkspaceDocument>
  saveWorkspace(workspace: WorkspaceDocument): Promise<void>
}
