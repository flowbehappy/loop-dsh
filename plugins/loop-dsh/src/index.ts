import { join } from "node:path";

import { LoopDshService, type LoopDshServiceOptions } from "./service.js";
import type { CordisLikeContext } from "./runtime-bridge.js";

export * from "./config.js";
export * from "./daemon-manager.js";
export * from "./local-turn-sync.js";
export * from "./oauth-bootstrap.js";
export * from "./runtime-bridge.js";
export * from "./service.js";

export const name = "loop-dsh";

export interface CordisPluginConfig {
  stateDir?: string;
  loopServerUrl?: string;
  loopConfigDir?: string;
  loopBinaryPath?: string;
  autoDownloadBinary?: boolean;
}

export interface DshPluginContext extends CordisLikeContext {
  profileContext?: {
    name?: string;
    home?: string;
  };
  provide?(serviceName: string, value: unknown): void;
  effect?(setup: () => () => void | Promise<void>, label?: string): void;
}

export function apply(ctx: DshPluginContext, config: CordisPluginConfig = {}): void {
  const profileHome = ctx.profileContext?.home?.trim();
  const stateDir =
    config.stateDir?.trim() ||
    (profileHome ? join(profileHome, "loop-dsh") : undefined);

  const options: LoopDshServiceOptions = {
    stateDir,
    loopServerUrl: config.loopServerUrl || undefined,
    loopConfigDir: config.loopConfigDir || undefined,
    loopBinaryPath: config.loopBinaryPath || undefined,
    autoDownloadBinary: config.autoDownloadBinary,
    dshHome: profileHome,
    cordisContext: ctx,
  };

  const service = new LoopDshService(options);
  ctx.provide?.("loopDsh", service);

  const saved = service.configStore.read();
  if (saved.binding) {
    void service.ensureConnected().catch(() => {
      void service.runtimeBridge.start();
    });
  } else {
    // Still opportunistically attach if a local Loop Desktop / CLI daemon is already running.
    void service.runtimeBridge.start();
  }

  ctx.effect?.(() => {
    return () => service.dispose();
  }, "loop-dsh: lifecycle");
}

export default {
  name,
  apply,
};
