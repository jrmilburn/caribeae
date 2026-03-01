import "server-only";

import { normalizeEmail, normalizePhone } from "@/lib/auth/identity";
import { findEligibleTeacherForIdentifiers } from "@/server/teacher/eligibility";

type ClerkVerification = { status?: string | null } | null | undefined;

type ClerkEmail = { emailAddress: string; verification?: ClerkVerification };

type ClerkPhone = { phoneNumber: string; verification?: ClerkVerification };

type ClerkUserLike = {
  emailAddresses?: ClerkEmail[];
  phoneNumbers?: ClerkPhone[];
};

function isVerified(verification: ClerkVerification) {
  return verification?.status === "verified";
}

export async function findEligibleTeacherForUser(user: ClerkUserLike | null) {
  const emails = Array.from(
    new Set(
      (user?.emailAddresses ?? [])
        .filter((entry) => isVerified(entry.verification))
        .map((entry) => normalizeEmail(entry.emailAddress))
        .filter(Boolean)
    )
  );

  const phones = Array.from(
    new Set(
      (user?.phoneNumbers ?? [])
        .filter((entry) => isVerified(entry.verification))
        .map((entry) => normalizePhone(entry.phoneNumber))
        .filter(Boolean)
    )
  );

  return findEligibleTeacherForIdentifiers(emails, phones);
}
