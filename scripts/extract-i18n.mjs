import asar from '@electron/asar'
import fs from 'node:fs'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const content = asar.extractFile(asarPath, 'out\\renderer\\assets\\i18n-Bjv3JWJO.js')

console.log('Tamanho i18n:', content.length)
fs.writeFileSync('D:\\Maestri-Open\\scripts\\i18n-sample.js', content)
console.log('Salvo em scripts/i18n-sample.js')
