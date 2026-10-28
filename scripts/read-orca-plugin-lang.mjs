import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'

try {
  const content = asar.extractFile(asarPath, 'out\\shared\\plugins\\plugin-language-pack-artifact.js')
  console.log('plugin-language-pack-artifact.js:');
  console.log(content.toString('utf8'))
} catch (e) {
  console.error(e)
}
