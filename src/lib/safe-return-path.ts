// Same-origin relative path only; rejects protocol-relative ("//evil.com"),
// backslash variants browsers normalize to "//", and absolute URLs.
export function safeLocalPath(value: unknown, fallback = "/"): string {
  if (typeof value !== "string" || value.length === 0 || value.length > 2048) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}
