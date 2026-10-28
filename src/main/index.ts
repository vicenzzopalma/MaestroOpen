import { join } from 'node:path'
import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { LoopManager } from './automation/loop-manager'
import { AutomationServer } from './automation/server'
import { registerIpc } from './ipc/register-ipc'
import { WorkspaceStore } from './persistence/workspace-store'
import { PtyManager } from './pty/pty-manager'

const ptyManager = new PtyManager()
let unregisterIpc: (() => void) | undefined
let automationServer: AutomationServer | undefined
let mainWindow: BrowserWindow | undefined
let cleanupStarted = false
let loops: LoopManager | undefined

function createWindow(): BrowserWindow {
  const isDevelopment = Boolean(process.env.ELECTRON_RENDERER_URL)
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: isDevelopment,
    backgroundColor: '#0b0d12',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'win32'
      ? { titleBarOverlay: { color: '#0b0d12', symbolColor: '#a8adbd', height: 42 } }
      : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  })

  if (!isDevelopment) window.once('ready-to-show', () => window.show())
  const ownerId = window.webContents.id
  window.on('closed', () => {
    loops?.dispose()
    ptyManager.disposeOwner(ownerId)
  })
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow = window
  return window
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) app.quit()

void app
  .whenReady()
  .then(async () => {
    if (process.platform === 'win32') app.setAppUserModelId('dev.maestri.open')

    const workspaceStore = new WorkspaceStore(join(app.getPath('userData'), 'workspace.json'))
    unregisterIpc = registerIpc(ptyManager, workspaceStore)
    loops = new LoopManager(workspaceStore, ptyManager)
    automationServer = new AutomationServer(ptyManager, workspaceStore, () => mainWindow, loops)
    await automationServer.start()
    ipcMain.handle('loop:start', (_event, id: string, prompt: string, deadline: string) =>
      loops!.start(id, prompt, deadline)
    )
    ipcMain.handle('loop:stop', (_event, id: string) => loops!.stop(id))
    ipcMain.handle('loop:list', () => loops!.list())
    ipcMain.handle('automation:call', (_event, method: string, params: Record<string, unknown>) =>
      automationServer!.dispatch(method, params ?? {})
    )

    mainWindow = createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
  .catch((error: unknown) => {
    console.error('Falha ao iniciar o Maestri Open:', error)
    app.quit()
  })

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (cleanupStarted) return
  cleanupStarted = true
  event.preventDefault()
  unregisterIpc?.()
  loops?.dispose()
  ptyManager.dispose()
  void automationServer?.stop().finally(() => app.exit(0))
})
