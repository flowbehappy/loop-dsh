import {LoopBackend} from "./runtime.ts"
import type {CredentialProvider} from "./credentials.ts"

export const name = "loop-native-backend"
export const inject = ["credentials"]
export interface Config {server: string; installation: string; pageOrigin: string}
interface HostContext {
  get(name: string): CredentialProvider
  provide(name: string, value: unknown): void
  effect(effect: () => () => Promise<void>): void
}
/** Internal service entry using the official DSH credential provider. */
export function apply(ctx: HostContext, config: Config): void {
  const backend = new LoopBackend({...config, provider: ctx.get("credentials")})
  ctx.provide("loopNativeBackend", backend)
  ctx.effect(() => () => backend.dispose())
}
