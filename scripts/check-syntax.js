import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

// Вбудований парсер Node.js перевіряє синтаксис без виконання коду й запуску сервера.
const projectRoot = fileURLToPath(new URL('../', import.meta.url));
async function findJavaScriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await findJavaScriptFiles(path)));
    else if (entry.isFile() && entry.name.endsWith('.js')) files.push(path);
  }
  return files.sort();
}

let checkedFiles = 0;
for (const directory of ['src', 'tests', 'scripts']) {
  for (const path of await findJavaScriptFiles(resolve(projectRoot, directory))) {
    const result = spawnSync(process.execPath, ['--check', path], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      process.exitCode = 1;
      break;
    }
    checkedFiles += 1;
  }
  if (process.exitCode) break;
}
if (!process.exitCode) console.log(`Синтаксис перевірено: ${checkedFiles} JavaScript-файлів`);
