import { writeFile } from 'node:fs/promises';
import { createOpenApiDocument } from '../src/openapi/document.js';

// JSON — експорт для зовнішніх інструментів; сервер генерує контракт із коду.
const path = new URL('../docs/api/openapi.json', import.meta.url);
await writeFile(path, `${JSON.stringify(createOpenApiDocument(), null, 2)}\n`);
console.log('OpenAPI експортовано в docs/api/openapi.json');
