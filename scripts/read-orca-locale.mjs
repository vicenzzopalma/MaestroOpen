import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'

try {
  const content = asar.extractFile(asarPath, 'out\\shared\\ui-locale.js')
  console.log('ui-locale.js:');
  console.log(content.toString('utf8'))
} catch (e) {
  console.error(e)
}
