import bcrypt from "bcryptjs";
import { BCRYPT_COST, BCRYPT_MAX_BYTES } from "./auth.constants.js";

export function isBcryptInputValid(password) {
  return (
    typeof password === "string" &&
    password.length > 0 &&
    Buffer.byteLength(password, "utf8") <= BCRYPT_MAX_BYTES
  );
}

export function validateBcryptInput(password, field = "password") {
  if (!isBcryptInputValid(password)) {
    throw new TypeError(
      `${field} must contain between 1 and ${BCRYPT_MAX_BYTES} UTF-8 bytes`,
    );
  }
}

export const passwordHasher = Object.freeze({
  hash(password) {
    validateBcryptInput(password);
    return bcrypt.hash(password, BCRYPT_COST);
  },
  compare(password, hash) {
    validateBcryptInput(password);
    return bcrypt.compare(password, hash);
  },
  compareAgainstDummy(password, hash) {
    return bcrypt.compare(password, hash);
  },
  hashDummy(password) {
    return bcrypt.hashSync(password, BCRYPT_COST);
  },
});
