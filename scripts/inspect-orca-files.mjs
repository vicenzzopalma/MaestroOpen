import fs from 'node:fs'
import path from 'node:path'

const orcaDir = 'C:\\Users\\vicenzzo.palma\\AppData\\Local\\Programs\\orca'
console.log('Arquivos em orca:');
try {
  console.log(fs.readdirSync(orcaDir))
  const resources = path.join(orcaDir, 'resources')
  if (fs.existsSync(resources)) {
    console.log('Resources:', fs.readdirSync(resources))
  }
} catch (e) {
  console.error(e)
}
