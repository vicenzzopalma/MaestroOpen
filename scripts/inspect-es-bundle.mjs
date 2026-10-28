import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const esContent = asar.extractFile(asarPath, 'out\\renderer\\assets\\es-AThXxY_9.js').toString('utf8')

console.log('Tamanho es:', esContent.length)
console.log('Início es:')
console.log(esContent.slice(0, 500))
