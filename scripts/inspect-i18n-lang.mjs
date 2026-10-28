import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const content = asar.extractFile(asarPath, 'out\\renderer\\assets\\i18n-Bjv3JWJO.js').toString('utf8')

let idx = 0
while ((idx = content.indexOf('settings.appearance.language.', idx)) !== -1) {
  console.log('Match at', idx, ':')
  console.log(content.slice(Math.max(0, idx - 100), Math.min(content.length, idx + 350)))
  idx += 30
}
