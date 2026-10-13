import { z as zod } from 'zod';

const serverEnvironmentSchema = zod.object({
  PORT: zod.coerce.number().int().min(1).max(65535).default(3000),
  HOST: zod.string().trim().min(1).default('127.0.0.1'),
});

export function readServerConfig(environment = process.env) {
  const result = serverEnvironmentSchema.safeParse(environment);
  if (!result.success)
    throw new Error('Некоректні HOST або PORT; порт має бути цілим числом від 1 до 65535');
  return Object.freeze(result.data);
}
