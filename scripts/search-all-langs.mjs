import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const list = asar.listPackage(asarPath)

for (const file of list) {
  if (!file.endsWith('.js') && !file.endsWith('.json')) continue
  try {
    const rel = file.replace(/^[\\\/]/, '')
    const raw = asar.extractFile(asarPath, rel)
    const str = raw.toString('utf8')
    if (str.includes('Français') || str.includes('Español') || str.includes('UI_LANGUAGE_ENGLISH')) {
      console.log('MATCH:', rel)
    }
  } catch (e) {}
}
