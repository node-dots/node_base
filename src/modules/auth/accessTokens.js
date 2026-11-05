import jwt from "jsonwebtoken";
import { ACCESS_TOKEN_TTL_SECONDS } from "./auth.constants.js";

export class AccessTokenService {
  constructor({ config, clock }) {
    if (
      !config ||
      typeof config.secret !== "string" ||
      Buffer.byteLength(config.secret, "utf8") < 32 ||
      typeof config.issuer !== "string" ||
      typeof config.audience !== "string" ||
      !clock ||
      typeof clock.now !== "function"
    ) {
      throw new TypeError("valid token config and clock are required");
    }
    this.config = config;
    this.clock = clock;
  }

  issue({ subject, tokenVersion }) {
    if (
      typeof subject !== "string" ||
      !Number.isSafeInteger(tokenVersion) ||
      tokenVersion < 0
    ) {
      throw new TypeError("token subject and version are invalid");
    }

    const now = this.clock.now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("clock.now() must return a valid Date");
    }

    return jwt.sign(
      { tokenVersion, iat: Math.floor(now.getTime() / 1000) },
      this.config.secret,
      {
        algorithm: "HS256",
        audience: this.config.audience,
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
        issuer: this.config.issuer,
        subject,
      },
    );
  }

  verify(token) {
    const now = this.clock.now();
    if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
      throw new TypeError("clock.now() must return a valid Date");
    }

    const payload = jwt.verify(token, this.config.secret, {
      algorithms: ["HS256"],
      audience: this.config.audience,
      clockTimestamp: Math.floor(now.getTime() / 1000),
      issuer: this.config.issuer,
    });

    if (
      typeof payload !== "object" ||
      typeof payload.sub !== "string" ||
      !Number.isSafeInteger(payload.tokenVersion) ||
      payload.tokenVersion < 0 ||
      !Number.isSafeInteger(payload.iat) ||
      !Number.isSafeInteger(payload.exp) ||
      payload.exp - payload.iat !== ACCESS_TOKEN_TTL_SECONDS
    ) {
      throw new Error("Invalid access token claims");
    }

    return { subject: payload.sub, tokenVersion: payload.tokenVersion };
  }
}
