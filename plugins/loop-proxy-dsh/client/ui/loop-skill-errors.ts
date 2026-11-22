/** Shared stable failures for Loop Skill discovery, references, and invocation. */

export class LoopSkillRuntimeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'LoopSkillRuntimeError'
    this.code = code
  }
}

export type LoopSkillFailureFormatter = (
  failure: Readonly<{code: string; message: string}>,
) => string

export function loopSkillError(code: string, message: string): LoopSkillRuntimeError {
  return new LoopSkillRuntimeError(code, message)
}

export function asLoopSkillRuntimeError(
  error: unknown,
  fallbackCode: string,
): LoopSkillRuntimeError {
  if (error instanceof LoopSkillRuntimeError) return error
  const code = error !== null && typeof error === 'object' &&
    'code' in error && typeof error.code === 'string'
    ? error.code
    : fallbackCode
  return new LoopSkillRuntimeError(
    code,
    error instanceof Error ? error.message : 'Loop Skill request failed.',
  )
}

export function withLocalizedLoopSkillMessage(
  error: LoopSkillRuntimeError,
  formatFailure: LoopSkillFailureFormatter,
): LoopSkillRuntimeError {
  const message = formatFailure({code: error.code, message: error.message})
  return message === error.message
    ? error
    : new LoopSkillRuntimeError(error.code, message)
}
