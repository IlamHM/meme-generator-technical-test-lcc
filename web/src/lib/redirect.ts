// safeRedirectPath memfilter param ?redirect= agar hanya path internal yang
// diterima — menolak open redirect (mis. "//evil.com" yang diparse sebagai
// protocol-relative URL oleh browser).
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return fallback;
  }
  return value;
}
