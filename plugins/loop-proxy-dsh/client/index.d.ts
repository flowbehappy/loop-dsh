import type { Context } from "@deepseek-ai/cordis"

export declare const name: "@pingkai/loop-dsh/client"
export declare const inject: readonly ["remote"]
export declare function apply(ctx: Context): Promise<() => Promise<void>>
