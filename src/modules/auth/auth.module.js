import mongoose from "mongoose";
import { systemClock } from "../../utils/calendar.js";
import { AuditModel } from "../audit/audit.model.js";
import { AuditRepository } from "../audit/audit.repository.js";
import { AuditWriter } from "../audit/audit.writer.js";
import { PersonModel } from "../people/person.model.js";
import { PersonRepository } from "../people/person.repository.js";
import { UnitOfWork } from "../../workflows/unitOfWork.js";
import { AuthController } from "./auth.controller.js";
import { createAuthRoutes } from "./auth.routes.js";
import { AccessTokenService } from "./accessTokens.js";
import { AuthService } from "./auth.service.js";

export function createAuthModule({
  config,
  loginRateLimiter,
  connection = mongoose.connection,
  personRepository = new PersonRepository({ personModel: PersonModel }),
  auditRepository = new AuditRepository({ auditModel: AuditModel }),
  clock = systemClock,
}) {
  const auditWriter = new AuditWriter({ auditRepository, clock });
  const unitOfWork = new UnitOfWork({ connection, auditWriter });
  const tokenService = new AccessTokenService({ config, clock });
  const authService = new AuthService({
    personRepository,
    tokenService,
    unitOfWork,
  });
  const authController = new AuthController({ authService });

  return {
    authService,
    personRepository,
    unitOfWork,
    router: createAuthRoutes({
      authService,
      authController,
      loginRateLimiter,
    }),
  };
}
