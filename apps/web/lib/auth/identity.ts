export type IdentifierType = "email" | "phone";

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function detectIdentifierType(value: string): IdentifierType {
  return value.includes("@") ? "email" : "phone";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizePhone(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const plusPrefixed = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return plusPrefixed ? `+${digits}` : digits;
}

export function isValidE164(value: string): boolean {
  return E164_PATTERN.test(value);
}

export function normalizeIdentifier(value: string, type: IdentifierType): string {
  return type === "email" ? normalizeEmail(value) : normalizePhone(value);
}

export function maskIdentifier(value: string, type: IdentifierType): string {
  if (type === "email") {
    const normalized = normalizeEmail(value);
    const [local, domain] = normalized.split("@");
    if (!domain) return normalized;
    const first = local?.[0] ?? "";
    return `${first}***@${domain}`;
  }

  const normalized = normalizePhone(value);
  if (!normalized.startsWith("+")) return value.trim();
  const digits = normalized.slice(1);
  const country = digits.slice(0, Math.min(2, digits.length)) || "";
  const last = digits.slice(-3) || "";
  return `+${country} *** *** ${last}`.trim();
}
