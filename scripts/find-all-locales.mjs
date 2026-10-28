import asar from '@electron/asar'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const list = asar.listPackage(asarPath)

const localeFiles = list.filter(f => f.includes('locales') || f.includes('i18n') || f.includes('translation') || f.includes('locale'))
console.log('Locale files:', localeFiles)
