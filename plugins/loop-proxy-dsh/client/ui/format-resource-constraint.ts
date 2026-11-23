// Only the name component of a directory lookup is form-encoded by Loop.
// Keep the wire value for unknown locators and malformed or directional text.
export function formatResourceConstraint(value: string): string {
  const match = /^(resource-lookup:[a-z][a-z0-9-]*\/)(.+)$/u.exec(value)
  if (!match) return value
  try {
    const name = decodeURIComponent(match[2].replace(/\+/gu, " "))
    if (/[\p{Cc}\p{Bidi_Control}]/u.test(name)) return value
    return match[1] + JSON.stringify(name)
  } catch {
    return value
  }
}
