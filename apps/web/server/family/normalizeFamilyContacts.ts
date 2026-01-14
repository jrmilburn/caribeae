import { isValidAuE164Mobile, normalizeAuMobileToE164 } from "@/server/phone/auMobile";

type NormalizedFamilyPhones = {
  primaryPhone: string | null;
  secondaryPhone: string | null;
};

type NormalizeResult =
  | { success: true; data: NormalizedFamilyPhones }
  | { success: false; error: string };

const PHONE_ERROR_MESSAGE = "Enter an AU mobile like 0412 345 678.";

function normalizePhoneField(value: string | null, label: string) {
  if (!value) return { value: null as string | null };

  const normalized = normalizeAuMobileToE164(value);
  if (!normalized || !isValidAuE164Mobile(normalized)) {
    return { error: `${label} phone must be an AU mobile like 0412 345 678.` };
  }

  return { value: normalized };
}

export function normalizeFamilyContactPhones(input: NormalizedFamilyPhones): NormalizeResult {
  const primary = normalizePhoneField(input.primaryPhone, "Primary contact");
  if (primary.error) {
    return { success: false, error: primary.error ?? PHONE_ERROR_MESSAGE };
  }

  const secondary = normalizePhoneField(input.secondaryPhone, "Secondary contact");
  if (secondary.error) {
    return { success: false, error: secondary.error ?? PHONE_ERROR_MESSAGE };
  }

  return {
    success: true,
    data: {
      primaryPhone: primary.value ?? null,
      secondaryPhone: secondary.value ?? null,
    },
  };
}
