import { existsSync } from 'node:fs'
import { delimiter } from 'node:path'
import type { ShellDescriptor } from '../../shared/contracts'

function executableOnPath(name: string): string | undefined {
  const extensions = process.platform === 'win32' ? ['', '.exe', '.cmd', '.bat'] : ['']
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    for (const extension of extensions) {
      const candidate = `${directory}${process.platform === 'win32' ? '\\' : '/'}${name}${extension}`
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}

export function discoverShells(): ShellDescriptor[] {
  const systemRoot = process.env.SystemRoot ?? 'C:\\Windows'
  const defaultPwsh = `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
  const defaultCmd = process.env.ComSpec ?? `${systemRoot}\\System32\\cmd.exe`

  const candidates: Array<ShellDescriptor & { candidates: string[] }> =
    process.platform === 'win32'
      ? [
          {
            id: 'powershell',
            name: 'Windows PowerShell',
            executable: existsSync(defaultPwsh) ? defaultPwsh : '',
            candidates: ['powershell', 'pwsh'],
            args: ['-NoLogo'],
            kind: 'powershell'
          },
          {
            id: 'cmd',
            name: 'Command Prompt',
            executable: existsSync(defaultCmd) ? defaultCmd : 'cmd.exe',
            candidates: ['cmd'],
            args: [],
            kind: 'cmd'
          },
          {
            id: 'pwsh',
            name: 'PowerShell 7',
            executable: '',
            candidates: ['pwsh'],
            args: ['-NoLogo'],
            kind: 'powershell'
          },
          {
            id: 'git-bash',
            name: 'Git Bash',
            executable: '',
            candidates: ['bash'],
            args: ['--login', '-i'],
            kind: 'bash'
          },
          {
            id: 'wsl',
            name: 'WSL',
            executable: '',
            candidates: ['wsl'],
            args: [],
            kind: 'wsl'
          }
        ]
      : [
          {
            id: 'zsh',
            name: 'Zsh',
            executable: '/bin/zsh',
            candidates: [],
            args: ['-l'],
            kind: 'zsh'
          },
          {
            id: 'bash',
            name: 'Bash',
            executable: '/bin/bash',
            candidates: [],
            args: ['-l'],
            kind: 'bash'
          }
        ]

  return candidates.flatMap(({ candidates: names, ...shell }) => {
    const executable = shell.executable || names.map(executableOnPath).find(Boolean)
    return executable && existsSync(executable) ? [{ ...shell, executable }] : []
  })
}
