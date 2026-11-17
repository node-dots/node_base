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
import { withHistoryContext } from "../src/modules/history/history.context.js";

const { MONGO_URI } = readDatabaseConfig();
const config = readBootstrapAdminConfig();
await connectMongo(MONGO_URI);

try {
  const session = await PersonModel.db.startSession();
  let result;
  try {
    result = await withHistoryContext(
      {
        requestId: "bootstrap-admin",
        source: "SEED",
        reason: "Create the initial administrator account",
      },
      () =>
        session.withTransaction(() =>
          bootstrapAdmin({
            config,
            personRepository: new PersonRepository({
              personModel: PersonModel,
            }),
            session,
          }),
        ),
    );
  } finally {
    await session.endSession();
  }
  console.log(
    result.created
      ? "Початковий ADMIN створений"
      : "ADMIN вже налаштований; змін не внесено",
  );
} finally {
  await disconnectMongo();
}
