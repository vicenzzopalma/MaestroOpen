import { execSync } from 'node:child_process'

const asarPath = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca\\resources\\app.asar'
const list = execSync(`npx asar list "${asarPath}"`).toString().split('\n')

const matches = list.filter(line => /locale|i18n|lang|translation/i.test(line))
console.log('Matches:', matches.slice(0, 50))
