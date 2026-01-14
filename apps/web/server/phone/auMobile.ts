export function normalizeAuMobileToE164(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  const compact = trimmed.replace(/[()\s-]/g, "");

  if (/^\+614\d{8}$/.test(compact)) return compact;
  if (/^614\d{8}$/.test(compact)) return `+${compact}`;
  if (/^04\d{8}$/.test(compact)) return `+61${compact.slice(1)}`;
  if (/^4\d{8}$/.test(compact)) return `+61${compact}`;

  return null;
}

export function isValidAuE164Mobile(value: string): boolean {
  return /^\+614\d{8}$/.test(value);
}
