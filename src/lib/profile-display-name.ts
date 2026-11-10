export function profileDisplayName(firstName: string | null, lastName: string | null, email: string): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ") || email.trim();
}
