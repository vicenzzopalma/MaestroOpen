import { app, ipcMain } from 'electron'
import type { CreateTerminalRequest, WorkspaceDocument } from '../../shared/contracts'
import { defaultAutomationEndpoint } from '../../shared/automation'
import { IPC } from '../../shared/ipc'
import type { WorkspaceStore } from '../persistence/workspace-store'
import type { PtyManager } from '../pty/pty-manager'

export function registerIpc(pty: PtyManager, workspace: WorkspaceStore): () => void {
  ipcMain.handle(IPC.appInfo, () => ({
    version: app.getVersion(),
    platform: process.platform,
    automationEndpoint: defaultAutomationEndpoint()
  }))
  ipcMain.handle(IPC.shellsList, () => pty.listShells())
  ipcMain.handle(IPC.terminalCreate, (event, request: CreateTerminalRequest) =>
    pty.create(event.sender, request)
  )
  ipcMain.handle(IPC.terminalInput, (event, id: string, text: string) =>
    pty.write(event.sender.id, id, text)
  )
  ipcMain.handle(IPC.terminalResize, (event, id: string, cols: number, rows: number) =>
    pty.resize(event.sender.id, id, cols, rows)
  )
  ipcMain.handle(IPC.terminalRead, (event, id: string, lines?: number) =>
    pty.read(event.sender.id, id, lines)
  )
  ipcMain.handle(IPC.terminalKill, (event, id: string) => pty.kill(event.sender.id, id))
  ipcMain.handle(IPC.workspaceLoad, () => workspace.load())
  ipcMain.handle(IPC.workspaceSave, (_event, value: WorkspaceDocument) => workspace.save(value))

  return () => {
    for (const channel of Object.values(IPC)) ipcMain.removeHandler(channel)
  }
}
