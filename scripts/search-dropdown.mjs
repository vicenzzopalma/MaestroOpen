import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const list = asar.listPackage(asarPath).filter(f => f.includes('renderer') && f.endsWith('.js'))

for (const file of list) {
  try {
    const rel = file.replace(/^[\\\/]/, '')
    const raw = asar.extractFile(asarPath, rel).toString('utf8')
    if (raw.includes('settings.appearance.language.french') || raw.includes('settings.appearance.language.spanish')) {
      console.log('DROPDOWN MATCH:', rel)
    }
  } catch (e) {}
}
