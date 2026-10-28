import asar from '@electron/asar'
import fs from 'node:fs'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'

// Extrai arquivos js do renderer para inspecionar
const list = asar.listPackage(asarPath).filter(f => f.includes('renderer') && f.endsWith('.js'))
console.log('Arquivos renderer js:', list.length)

for (const file of list) {
  try {
    const content = asar.extractFile(asarPath, file.replace(/^\//, '').replace(/\//g, '\\')).toString('utf8')
    if (content.includes('Français') || content.includes('Español')) {
      console.log('Encontrado em:', file)
    }
  } catch (e) {
    // ignore
  }
}
