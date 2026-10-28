import { contextBridge, ipcRenderer } from 'electron'
import type {
  CreateTerminalRequest,
  MaestriDesktopApi,
  TerminalDataEvent,
  TerminalExitEvent,
  WorkspaceDocument
} from '../shared/contracts'
import { IPC } from '../shared/ipc'

const api: MaestriDesktopApi = {
  automation: (method, params) => ipcRenderer.invoke('automation:call', method, params),
  loopStart: (nodeId, prompt, deadline) =>
    ipcRenderer.invoke('loop:start', nodeId, prompt, deadline),
  loopStop: (nodeId) => ipcRenderer.invoke('loop:stop', nodeId),
  loopList: () => ipcRenderer.invoke('loop:list'),
  getAppInfo: () => ipcRenderer.invoke(IPC.appInfo),
  listShells: () => ipcRenderer.invoke(IPC.shellsList),
  createTerminal: (request: CreateTerminalRequest) =>
    ipcRenderer.invoke(IPC.terminalCreate, request),
  writeTerminal: (id: string, text: string) => ipcRenderer.invoke(IPC.terminalInput, id, text),
  resizeTerminal: (id: string, cols: number, rows: number) =>
    ipcRenderer.invoke(IPC.terminalResize, id, cols, rows),
  readTerminal: (id: string, lines?: number) => ipcRenderer.invoke(IPC.terminalRead, id, lines),
  killTerminal: (id: string) => ipcRenderer.invoke(IPC.terminalKill, id),
  onTerminalData: (listener: (event: TerminalDataEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TerminalDataEvent): void =>
      listener(payload)
    ipcRenderer.on(IPC.terminalData, handler)
    return () => ipcRenderer.removeListener(IPC.terminalData, handler)
  },
  onTerminalExit: (listener: (event: TerminalExitEvent) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, payload: TerminalExitEvent): void =>
      listener(payload)
    ipcRenderer.on(IPC.terminalExit, handler)
    return () => ipcRenderer.removeListener(IPC.terminalExit, handler)
  },
  onWorkspaceChanged: (listener) => {
    const handler = (_event: Electron.IpcRendererEvent, workspace: WorkspaceDocument): void =>
      listener(workspace)
    ipcRenderer.on(IPC.workspaceChanged, handler)
    return () => ipcRenderer.removeListener(IPC.workspaceChanged, handler)
  },
  loadWorkspace: () => ipcRenderer.invoke(IPC.workspaceLoad),
  saveWorkspace: (workspace: WorkspaceDocument) => ipcRenderer.invoke(IPC.workspaceSave, workspace)
}

contextBridge.exposeInMainWorld('maestri', api)
