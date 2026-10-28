import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const list = asar.listPackage(asarPath).filter(f => f.endsWith('.js'))

console.log('Total js:', list.length)

for (const file of list) {
  try {
    const content = asar.extractFile(asarPath, file.replace(/^\//, '').replace(/\//g, '\\')).toString('utf8')
    if (content.includes('UI_LANGUAGE_FRENCH') || content.includes('ui-language')) {
      console.log('Match UI_LANGUAGE:', file)
    }
  } catch (e) {}
}
