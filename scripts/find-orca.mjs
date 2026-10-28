import { execSync } from 'node:child_process'

try {
  const out = execSync('powershell -NoProfile -Command "Get-Process -Name Orca | Select-Object -ExpandProperty Path -Unique"').toString()
  console.log('Orca Path:', out.trim())
} catch (e) {
  console.error(e)
}
