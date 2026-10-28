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
  workspaceChanged: 'workspace:changed',
  workspaceLoad: 'workspace:load',
  workspaceSave: 'workspace:save'
} as const
