import asar from '@electron/asar'
import fs from 'node:fs'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const content = asar.extractFile(asarPath, 'out\\renderer\\assets\\useSettingsNavigationMetadata-BX9G3FFD.js').toString('utf8')

console.log('Tamanho useSettingsNavigationMetadata:', content.length)

// Procura ocorrências de Français, Español, etc.
const idx = content.indexOf('Français')
if (idx !== -1) {
  console.log('Snippet entorno de Français:')
  console.log(content.slice(Math.max(0, idx - 300), Math.min(content.length, idx + 300)))
}
