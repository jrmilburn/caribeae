import "server-only";

import { createHash, randomBytes, timingSafeEqual } from "crypto";

const TOKEN_BYTES = 32;
const TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type VerifyParams = {
  token: string | null | undefined;
  hash: string | null | undefined;
  expiresAt: Date | null | undefined;
};

export function createOnboardingUpdateToken() {
  const token = randomBytes(TOKEN_BYTES).toString("hex");
  const hash = hashOnboardingUpdateToken(token);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);
  return { token, hash, expiresAt };
}

export function hashOnboardingUpdateToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function verifyOnboardingUpdateToken({ token, hash, expiresAt }: VerifyParams) {
  if (!token || !hash || !expiresAt) return false;
  if (expiresAt.getTime() < Date.now()) return false;

  const tokenHash = hashOnboardingUpdateToken(token);
  if (tokenHash.length !== hash.length) return false;

  return timingSafeEqual(Buffer.from(tokenHash, "hex"), Buffer.from(hash, "hex"));
}
