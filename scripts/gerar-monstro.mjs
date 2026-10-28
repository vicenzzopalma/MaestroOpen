import fs from 'node:fs';
import path from 'node:path';

const rootDir = process.cwd();
const outputFile = path.join(rootDir, 'monstro.txt');

const includeExtensions = new Set(['.ts', '.tsx', '.css', '.html', '.json', '.md', '.bat']);
const excludeDirs = new Set(['node_modules', 'dist', 'out', 'release', 'analysis', '.git', '.gemini', '.reference', '1']);

function walk(dir) {
  let files = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (excludeDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(walk(fullPath));
    } else {
      const ext = path.extname(entry.name).toLowerCase();
      if (includeExtensions.has(ext) && entry.name !== 'monstro.txt' && entry.name !== 'package-lock.json') {
        files.push(fullPath);
      }
    }
  }
  return files;
}

const files = walk(rootDir).sort();
let content = `# MONSTRO.TXT - REPOSITÓRIO MAESTRI OPEN COMPLETO
# Data de Geração: ${new Date().toISOString()}
# Total de Arquivos: ${files.length}

`;

for (const file of files) {
  const relPath = path.relative(rootDir, file).replace(/\\/g, '/');
  const fileContent = fs.readFileSync(file, 'utf8');
  content += `\n================================================================================\n`;
  content += `FILE: ${relPath}\n`;
  content += `================================================================================\n\n`;
  content += fileContent + `\n`;
}

fs.writeFileSync(outputFile, content, 'utf8');
console.log(`Sucesso: ${files.length} arquivos combinados em monstro.txt (${fs.statSync(outputFile).size} bytes)`);
