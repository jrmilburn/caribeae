const HIDDEN_PATHS = ["/admin/dashboard", "/admin/schedule"];

export function shouldShowBack(pathname: string) {
  if (!pathname.startsWith("/admin")) return false;

  const cleanPath = pathname.split("?")[0];
  if (HIDDEN_PATHS.includes(cleanPath)) return false;

  if (/\/(new|edit)(\/|$)/.test(cleanPath)) return true;

  const segments = cleanPath.split("/").filter(Boolean);
  const adminIndex = segments.indexOf("admin");
  const afterAdmin = adminIndex >= 0 ? segments.slice(adminIndex + 1) : [];

  // Show when the path has multiple segments after /admin (e.g., /admin/messages/123)
  return afterAdmin.length >= 2;
}
