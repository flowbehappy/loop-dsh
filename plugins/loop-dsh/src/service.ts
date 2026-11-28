import {
  ConfigStore,
  type ConfigureLoopDshPatch,
  type HostSyncMode,
  type LoopDshConfig,
} from "./config.js";
import {
  DaemonManager,
  type DaemonReceipt,
  type EnsureDaemonResult,
  type HostRuntimeBridgeStatus,
} from "./daemon-manager.js";
import {
  type HostSessionBinding,
  LocalTurnSyncClient,
  type LocalTurnSyncInput,
  type LocalTurnSyncResponse,
} from "./local-turn-sync.js";
import {
  loginAndBootstrap,
  type LoginAndBootstrapOptions,
  type LoginAndBootstrapResult,
} from "./oauth-bootstrap.js";
import {
  type CordisLikeContext,
  createCordisHostAdapter,
  type HostSessionAdapter,
  RuntimeBridge,
} from "./runtime-bridge.js";

export interface LoopDshServiceOptions {
  stateDir?: string;
  loopServerUrl?: string;
  loopConfigDir?: string;
  loopBinaryPath?: string;
  autoDownloadBinary?: boolean;
  dshHome?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  hostAdapter?: HostSessionAdapter;
  cordisContext?: CordisLikeContext;
  startupTimeoutMs?: number;
}

export interface LoopDshStatusSnapshot {
  config: LoopDshConfig;
  daemonRunning: boolean;
  daemonReceipt: DaemonReceipt | null;
  bridgeStatus: HostRuntimeBridgeStatus | null;
  bridgeConnected: boolean;
  daemonInstanceId?: string;
}

export class LoopDshService {
  readonly configStore: ConfigStore;
  readonly daemonManager: DaemonManager;
  readonly runtimeBridge: RuntimeBridge;
  readonly localTurnSync: LocalTurnSyncClient;
  private readonly fetchImpl: typeof fetch;
  private readonly cleanupCallbacks: Array<() => void> = [];

  constructor(options: LoopDshServiceOptions = {}) {
    const env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.configStore = new ConfigStore(options.stateDir, env);

    const initialPatch: ConfigureLoopDshPatch = {};
    if (options.loopServerUrl?.trim()) {
      initialPatch.loopServerUrl = options.loopServerUrl.trim();
    }
    if (options.loopConfigDir?.trim()) {
      initialPatch.loopConfigDir = options.loopConfigDir.trim();
    }
    if (options.loopBinaryPath?.trim()) {
      initialPatch.loopBinaryPath = options.loopBinaryPath.trim();
    }
    if (options.autoDownloadBinary !== undefined) {
      initialPatch.autoDownloadBinary = options.autoDownloadBinary;
    }
    if (Object.keys(initialPatch).length > 0) {
      this.configStore.configure(initialPatch);
    }

    this.daemonManager = new DaemonManager({
      configStore: this.configStore,
      env,
      fetchImpl: this.fetchImpl,
      startupTimeoutMs: options.startupTimeoutMs,
    });

    let adapter = options.hostAdapter;
    if (!adapter && options.cordisContext) {
      const cordisAdapter = createCordisHostAdapter(options.cordisContext, (sessionId) =>
        this.runtimeBridge.getSessionContext(sessionId),
      );
      adapter = cordisAdapter.adapter;
      this.cleanupCallbacks.push(cordisAdapter.dispose);
    }
    if (!adapter) {
      adapter = {
        async openSession() {},
        async runTurn() {},
      };
    }

    this.runtimeBridge = new RuntimeBridge({
      resolveReceipt: async () => {
        const running = await this.daemonManager.inspectRunningDaemon();
        return running?.receipt ?? null;
      },
      hostAdapter: adapter,
      dshHome: options.dshHome,
    });

    this.localTurnSync = new LocalTurnSyncClient({
      configStore: this.configStore,
      resolveReceipt: async () => {
        const running = await this.daemonManager.inspectRunningDaemon();
        return running?.receipt ?? null;
      },
      fetchImpl: this.fetchImpl,
    });

    if (options.cordisContext) {
      const detachSync = this.localTurnSync.attachCordisSessionListener(
        options.cordisContext,
        (sessionId) => this.runtimeBridge.isLoopTurnActive(sessionId),
      );
      this.cleanupCallbacks.push(detachSync);
    }
  }

  configure(patch: ConfigureLoopDshPatch): LoopDshConfig {
    return this.configStore.configure(patch);
  }

  async getStatus(): Promise<LoopDshStatusSnapshot> {
    const config = this.configStore.read();
    const running = await this.daemonManager.inspectRunningDaemon(config);
    return {
      config,
      daemonRunning: Boolean(running),
      daemonReceipt: running?.receipt ?? null,
      bridgeStatus: running?.status ?? null,
      bridgeConnected: this.runtimeBridge.isConnected,
      daemonInstanceId: this.runtimeBridge.currentDaemonInstanceId,
    };
  }

  async loginAndBootstrap(
    params: Omit<LoginAndBootstrapOptions, "configStore" | "daemonManager" | "fetchImpl"> = {},
  ): Promise<LoginAndBootstrapResult> {
    const result = await loginAndBootstrap({
      ...params,
      configStore: this.configStore,
      daemonManager: this.daemonManager,
      fetchImpl: this.fetchImpl,
    });
    await this.runtimeBridge.connectOnce();
    return result;
  }

  async ensureConnected(): Promise<EnsureDaemonResult> {
    const daemon = await this.daemonManager.ensureDaemonRunning();
    if (!this.runtimeBridge.isConnected) {
      await this.runtimeBridge.connectOnce();
    }
    return daemon;
  }

  async setSessionSyncMode(
    dshSessionId: string,
    mode: HostSyncMode,
    options: { agentId?: string; target?: string; title?: string } = {},
  ): Promise<HostSessionBinding | null> {
    return await this.localTurnSync.setSessionSyncMode(dshSessionId, mode, options);
  }

  async listBindings(agentId?: string): Promise<HostSessionBinding[]> {
    return await this.localTurnSync.listBindings(agentId);
  }

  async syncLocalTurn(input: LocalTurnSyncInput): Promise<LocalTurnSyncResponse> {
    return await this.localTurnSync.syncLocalTurn(input);
  }

  async upgradeDaemon(): Promise<{ ok: true; stdout: string; stderr: string }> {
    return await this.daemonManager.upgradeDaemon();
  }

  async disconnect(options: { revokeOAuth?: boolean } = {}): Promise<void> {
    await this.runtimeBridge.stop();
    const current = this.configStore.read();
    if (options.revokeOAuth !== false && current.loopServerUrl && current.oauth?.refreshToken) {
      const form = new URLSearchParams({
        token: current.oauth.refreshToken,
        client_id: current.oauth.clientId,
      });
      await this.fetchImpl(`${current.loopServerUrl}/api/v1/auth/oauth/revoke`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form.toString(),
      }).catch(() => {});
    }
    this.configStore.update((cfg) => ({
      ...cfg,
      oauth: undefined,
      binding: undefined,
    }));
  }

  async dispose(options: { stopSpawnedDaemon?: boolean } = {}): Promise<void> {
    await this.runtimeBridge.stop();
    for (const cleanup of this.cleanupCallbacks.splice(0)) {
      cleanup();
    }
    if (options.stopSpawnedDaemon) {
      await this.daemonManager.stopOwnedDaemon();
    }
  }
}
