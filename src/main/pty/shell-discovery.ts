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
  const candidates: Array<ShellDescriptor & { candidates: string[] }> =
    process.platform === 'win32'
      ? [
          {
            id: 'pwsh',
            name: 'PowerShell 7',
            executable: '',
            candidates: ['pwsh'],
            args: ['-NoLogo'],
            kind: 'powershell'
          },
          {
            id: 'powershell',
            name: 'Windows PowerShell',
            executable: '',
            candidates: ['powershell'],
            args: ['-NoLogo'],
            kind: 'powershell'
          },
          {
            id: 'cmd',
            name: 'Command Prompt',
            executable: process.env.ComSpec ?? 'cmd.exe',
            candidates: [],
            args: [],
            kind: 'cmd'
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
