export function resolveFamilyName(guardianName: string) {
  const tokens = guardianName.trim().split(/\s+/).filter(Boolean);
  const last = tokens[tokens.length - 1] ?? guardianName.trim();
  return `${last} Family`;
}
