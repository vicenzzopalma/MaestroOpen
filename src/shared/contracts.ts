import { z } from 'zod'

export const IPC = {
  appInfo: 'app:info',
  shellsList: 'shells:list',
  terminalCreate: 'terminal:create',
  terminalInput: 'terminal:input',
  terminalResize: 'terminal:resize',
  terminalRead: 'terminal:read',
  terminalKill: 'terminal:kill',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save'
} as const

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

export const connectionSchema = z.object({
  id: z.string().min(1),
  fromNodeId: z.string().min(1),
  toNodeId: z.string().min(1),
  color: z.string().optional()
})

export const workspaceSchema = z.object({
  schemaVersion: z.literal(2),
  id: z.string().min(1),
  name: z.string().min(1),
  rootPath: z.string(),
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

export interface MaestriDesktopApi {
  getAppInfo(): Promise<{ version: string; platform: string; automationEndpoint: string }>
  listShells(): Promise<ShellDescriptor[]>
  createTerminal(request: CreateTerminalRequest): Promise<TerminalCreated>
  writeTerminal(id: string, text: string): Promise<void>
  resizeTerminal(id: string, cols: number, rows: number): Promise<void>
  readTerminal(id: string, lines?: number): Promise<string>
  killTerminal(id: string): Promise<void>
  onTerminalData(listener: (event: TerminalDataEvent) => void): () => void
  onTerminalExit(listener: (event: TerminalExitEvent) => void): () => void
  loadWorkspace(): Promise<WorkspaceDocument>
  saveWorkspace(workspace: WorkspaceDocument): Promise<void>
}
