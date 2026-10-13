import mongoose from 'mongoose';
import { z as zod } from 'zod';

export function readDatabaseConfig(environment = process.env) {
  const result = zod
    .object({
      MONGO_URI: zod
        .string()
        .min(1)
        .regex(/^mongodb(?:\+srv)?:\/\//),
    })
    .safeParse(environment);
  if (!result.success) throw new Error('MONGO_URI має бути адресою підключення MongoDB');
  return result.data;
}

// Відкриває спільне з’єднання застосунку з MongoDB.
export async function connectMongo(uri) {
  if (!uri) {
    throw new Error('Не задано MONGO_URI');
  }

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
  });

  return mongoose.connection;
}

// Закриває з’єднання під час завершення застосунку.
export async function disconnectMongo() {
  await mongoose.disconnect();
}

// Перевіряє, чи з’єднання відкрите та MongoDB відповідає.
export async function isMongoReady(connection = mongoose.connection) {
  if (connection.readyState !== mongoose.Connection.STATES.connected) {
    return false;
  }

  try {
    const result = await connection.db.command({ ping: 1 }, { timeoutMS: 2000 });

    return result.ok === 1;
  } catch {
    return false;
  }
}
