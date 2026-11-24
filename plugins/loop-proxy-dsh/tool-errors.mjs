// Preserve protocol evidence on tool surfaces that render only Error.message.
// Transport adapters sanitize server errors before they enter this boundary.
export function toolErrorText(error) {
  const message = String(error?.message ?? error).slice(0, 2048)
  if (typeof error?.code !== "string") return message
  const result = {code: error.code, message}
  for (const key of ["status", "outcomeUnknown", "serverCode", "hint", "details"]) {
    if (error[key] !== undefined) result[key] = error[key]
  }
  return JSON.stringify({error: result})
}
