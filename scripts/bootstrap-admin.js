import {
  connectMongo,
  disconnectMongo,
  readDatabaseConfig,
} from "../src/config/database.js";
import {
  readBootstrapAdminConfig,
  bootstrapAdmin,
} from "../src/modules/auth/bootstrapAdmin.js";
import { PersonModel } from "../src/modules/people/person.model.js";
import { PersonRepository } from "../src/modules/people/person.repository.js";

const { MONGO_URI } = readDatabaseConfig();
const config = readBootstrapAdminConfig();
await connectMongo(MONGO_URI);

try {
  const result = await bootstrapAdmin({
    config,
    personRepository: new PersonRepository({ personModel: PersonModel }),
  });
  console.log(
    result.created
      ? "Початковий ADMIN створений"
      : "ADMIN вже налаштований; змін не внесено",
  );
} finally {
  await disconnectMongo();
}
