import asar from '@electron/asar'
import fs from 'node:fs'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'

try {
  const content = asar.extractFile(asarPath, 'out\\shared\\ui-language.js')
  console.log('ui-language.js:');
  console.log(content.toString('utf8'))
} catch (e) {
  try {
    const content2 = asar.extractFile(asarPath, 'out/shared/ui-language.js')
    console.log(content2.toString('utf8'))
  } catch (err) {
    console.error('Erro 1:', e.message, 'Erro 2:', err.message)
  }
}
