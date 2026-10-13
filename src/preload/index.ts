import { contextBridge, ipcRenderer } from 'electron'
import {
  IPC,
  type CreateTerminalRequest,
  type MaestriDesktopApi,
  type TerminalDataEvent,
  type TerminalExitEvent,
  type WorkspaceDocument
} from '../shared/contracts'

const api: MaestriDesktopApi = {
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listShells: () => ipcRenderer.invoke(IPC.shellsList),
  createTerminal: (request: CreateTerminalRequest) => ipcRenderer.invoke(IPC.terminalCreate, request),
  writeTerminal: (id: string, text: string) => ipcRenderer.invoke(IPC.terminalInput, id, text),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.terminalResize, id, cols, rows),
  readTerminal: (id: string, lines?: number) => ipcRenderer.invoke(IPC.terminalRead, id, lines),
  killTerminal: (id: string) => ipcRenderer.invoke(IPC.terminalKill, id),
  onTerminalData: (listener: (event: TerminalDataEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent): void => listener(payload)
    ipcRenderer.on(IPC.terminalData, handler)
    return () => ipcRenderer.removeListener(IPC.terminalData, handler)
  },
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent): void => listener(payload)
    ipcRenderer.on(IPC.terminalExit, handler)
    return () => ipcRenderer.removeListener(IPC.terminalExit, handler)
  },
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad),
  saveWorkspace: (workspace: WorkspaceDocument) => ipcRenderer.invoke(IPC.workspaceSave, workspace)
}

contextBridge.exposeInMainWorld('maestri', api)
