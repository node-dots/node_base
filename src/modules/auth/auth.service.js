import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { AuthenticationError, BusinessError } from "../../utils/errors.js";
import { ACCOUNT_ROLE } from "../people/person.constants.js";
import {
  AUTH_ERROR_CODES,
  AUTH_ERROR_MESSAGES,
  MIN_PASSWORD_LENGTH,
} from "./auth.constants.js";
import { isBcryptInputValid, passwordHasher } from "./passwords.js";

const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  randomBytes(32).toString("hex"),
  10,
);

function invalidCredentials() {
  return new AuthenticationError(
    AUTH_ERROR_CODES.INVALID_CREDENTIALS,
    AUTH_ERROR_MESSAGES.INVALID_CREDENTIALS,
  );
}

function authenticationRequired() {
  return new AuthenticationError(
    AUTH_ERROR_CODES.AUTHENTICATION_REQUIRED,
    AUTH_ERROR_MESSAGES.AUTHENTICATION_REQUIRED,
  );
}

function normalizeEmail(email) {
  return typeof email === "string" ? email.trim().toLowerCase() : "";
}

export class AuthService {
  constructor({
    personRepository,
    tokenService,
    unitOfWork,
    hasher = passwordHasher,
  }) {
    if (!personRepository || !tokenService || !unitOfWork || !hasher) {
      throw new TypeError(
        "personRepository, tokenService, unitOfWork, and hasher are required",
      );
    }
    this.personRepository = personRepository;
    this.tokenService = tokenService;
    this.unitOfWork = unitOfWork;
    this.hasher = hasher;
  }

  async login({ email, password }) {
    const validPassword = isBcryptInputValid(password);
    const accountPerson = await this.personRepository.findAccountByEmail(
      normalizeEmail(email),
    );
    const account = accountPerson?.account;
    const hash = account?.passwordHash ?? DUMMY_PASSWORD_HASH;

    let matches = false;
    if (validPassword) {
      try {
        matches = await this.hasher.compare(password, hash);
      } catch {
        matches = false;
      }
    }

    if (!account || !account.enabled || !validPassword || !matches) {
      throw invalidCredentials();
    }

    return {
      accessToken: this.tokenService.issue({
        subject: accountPerson.id,
        tokenVersion: account.tokenVersion,
      }),
      tokenType: "Bearer",
      expiresIn: 1800,
    };
  }

  async authenticate(token) {
    let claims;
    try {
      claims = this.tokenService.verify(token);
    } catch {
      throw authenticationRequired();
    }

    const accountPerson = await this.personRepository.findAccountById(
      claims.subject,
    );
    const account = accountPerson?.account;
    if (
      !account ||
      !account.enabled ||
      account.tokenVersion !== claims.tokenVersion
    ) {
      throw authenticationRequired();
    }

    return {
      id: accountPerson.id,
      roles: [...account.roles],
    };
  }

  async changePassword(actor, { currentPassword, newPassword }, requestId) {
    if (
      !isBcryptInputValid(currentPassword) ||
      !isBcryptInputValid(newPassword) ||
      [...newPassword].length < MIN_PASSWORD_LENGTH
    ) {
      throw invalidCredentials();
    }

    const current = await this.personRepository.findAccountById(actor.id);
    if (!current?.account?.enabled) throw authenticationRequired();

    let currentMatches = false;
    try {
      currentMatches = await this.hasher.compare(
        currentPassword,
        current.account.passwordHash,
      );
    } catch {
      currentMatches = false;
    }
    if (!currentMatches) throw invalidCredentials();

    if (await this.hasher.compare(newPassword, current.account.passwordHash)) {
      throw new BusinessError(
        AUTH_ERROR_CODES.PASSWORD_UNCHANGED,
        AUTH_ERROR_MESSAGES.PASSWORD_UNCHANGED,
      );
    }

    const passwordHash = await this.hasher.hash(newPassword);
    await this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const updated = await this.personRepository.advanceAccountTokenVersion(
        {
          personId: actor.id,
          expectedTokenVersion: current.account.tokenVersion,
          passwordHash,
        },
        { session },
      );
      if (!updated) throw authenticationRequired();

      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "PASSWORD_CHANGED",
        entityType: "PERSON",
        entityId: actor.id,
        safeFields: [],
      });
    });
  }

  async logoutAll(actor, requestId) {
    await this.unitOfWork.execute(async ({ session, recordAudit }) => {
      const current = await this.personRepository.findAccountById(actor.id, {
        session,
      });
      if (!current?.account?.enabled) throw authenticationRequired();

      const updated = await this.personRepository.advanceAccountTokenVersion(
        {
          personId: actor.id,
          expectedTokenVersion: current.account.tokenVersion,
        },
        { session },
      );
      if (!updated) throw authenticationRequired();

      await recordAudit({
        actorId: actor.id,
        requestId,
        action: "SESSIONS_REVOKED",
        entityType: "PERSON",
        entityId: actor.id,
        safeFields: [],
      });
    });
  }
}

export function isAdminRolePresent(accountPerson) {
  return accountPerson?.account?.roles?.includes(ACCOUNT_ROLE.ADMIN) === true;
}
