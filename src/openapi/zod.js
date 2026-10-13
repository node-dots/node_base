import { z } from 'zod';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';

// Розширення має виконатися до створення схем, які реєструємо в OpenAPI.
extendZodWithOpenApi(z);
export { z };
