import { randomUUID } from "node:crypto";

import { type ConfigStore, type HostSyncMode, normalizeSyncMode } from "./config.js";
import type { DaemonReceipt } from "./daemon-manager.js";
import { type CordisLikeContext, LOOP_RUNTIME_SOURCE_KIND } from "./runtime-bridge.js";

export interface HostSessionBinding {
  agentId: string;
  loopScopeKey: string;
  scopeId?: string;
  target?: string;
  title?: string;
  dshSessionId: string;
  syncMode: HostSyncMode;
  updatedAt: string;
}

export interface UpsertBindingInput {
  agentId: string;
  dshSessionId: string;
  loopScopeKey?: string;
  scopeId?: string;
  target?: string;
  title?: string;
  syncMode?: HostSyncMode;
}

export interface LocalTurnSyncInput {
  agentId: string;
  dshSessionId: string;
  role: "user" | "assistant";
  content: string;
  clientMessageId?: string;
  target?: string;
  title?: string;
  syncMode?: HostSyncMode;
}

export interface LocalTurnSyncResponse {
  synced: boolean;
  syncMode: HostSyncMode;
  messageId?: string;
  target?: string;
  scopeId?: string;
  seq?: number;
  replayed?: boolean;
  binding?: HostSessionBinding;
}

export interface LocalTurnSyncClientOptions {
  configStore: ConfigStore;
  resolveReceipt: () => Promise<DaemonReceipt | null> | DaemonReceipt | null;
  fetchImpl?: typeof fetch;
}

function extractMessageText(data: Record<string, unknown> | undefined): string {
  if (!data) {
    return "";
  }
  if (typeof data.content === "string") {
    return data.content.trim();
  }
  if (Array.isArray(data.content)) {
    return data.content
      .map((part) => {
        if (typeof part === "string") {
          return part;
        }
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n")
      .trim();
  }
  if (typeof data.text === "string") {
    return data.text.trim();
  }
  return "";
}

/**
 * Syncs local DeepSeek Harness user/assistant turns and session bindings to
 * `/api/internal/runtimes/deepseek-harness/{bindings,local-turns}` on `loop daemon`.
 */
export class LocalTurnSyncClient {
  private readonly configStore: ConfigStore;
  private readonly resolveReceipt: () => Promise<DaemonReceipt | null> | DaemonReceipt | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options: LocalTurnSyncClientOptions) {
    this.configStore = options.configStore;
    this.resolveReceipt = options.resolveReceipt;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  private async requireReceipt(): Promise<DaemonReceipt> {
    const receipt = await this.resolveReceipt();
    if (!receipt) {
      throw new Error("loop daemon is not running; cannot access /api/internal/runtimes/deepseek-harness");
    }
    return receipt;
  }

  getSessionSyncMode(dshSessionId: string): HostSyncMode {
    const config = this.configStore.read();
    return config.sessionSyncModes[dshSessionId] ?? "synced";
  }

  async listBindings(agentId?: string): Promise<HostSessionBinding[]> {
    const receipt = await this.requireReceipt();
    const url = new URL(`${receipt.baseUrl}/api/internal/runtimes/deepseek-harness/bindings`);
    if (agentId?.trim()) {
      url.searchParams.set("agentId", agentId.trim());
    }
    const response = await this.fetchImpl(url.toString(), {
      method: "GET",
      headers: {
        "X-Loop-Control-Token": receipt.controlToken,
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to list DSH session bindings (${response.status})`);
    }
    const body = (await response.json()) as { bindings?: HostSessionBinding[] };
    return body.bindings ?? [];
  }

  async upsertBinding(input: UpsertBindingInput): Promise<HostSessionBinding> {
    const receipt = await this.requireReceipt();
    const syncMode = input.syncMode ? normalizeSyncMode(input.syncMode) : undefined;
    if (syncMode) {
      this.configStore.update((current) => ({
        ...current,
        sessionSyncModes: {
          ...current.sessionSyncModes,
          [input.dshSessionId]: syncMode,
        },
      }));
    }

    const response = await this.fetchImpl(
      `${receipt.baseUrl}/api/internal/runtimes/deepseek-harness/bindings`,
      {
        method: "POST",
        headers: {
          "X-Loop-Control-Token": receipt.controlToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          ...input,
          syncMode,
        }),
      },
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to upsert DSH session binding (${response.status}): ${errText}`);
    }
    const body = (await response.json()) as { binding: HostSessionBinding };
    return body.binding;
  }

  async setSessionSyncMode(
    dshSessionId: string,
    mode: HostSyncMode,
    options: { agentId?: string; target?: string; title?: string } = {},
  ): Promise<HostSessionBinding | null> {
    const normalized = normalizeSyncMode(mode);
    const config = this.configStore.update((current) => ({
      ...current,
      sessionSyncModes: {
        ...current.sessionSyncModes,
        [dshSessionId]: normalized,
      },
    }));
    const agentId = options.agentId ?? config.binding?.agentId;
    const receipt = await this.resolveReceipt();
    if (!agentId || !receipt) {
      return null;
    }
    return await this.upsertBinding({
      agentId,
      dshSessionId,
      target: options.target,
      title: options.title,
      syncMode: normalized,
    });
  }

  async syncLocalTurn(input: LocalTurnSyncInput): Promise<LocalTurnSyncResponse> {
    const receipt = await this.requireReceipt();
    const effectiveMode = normalizeSyncMode(
      input.syncMode ?? this.getSessionSyncMode(input.dshSessionId),
    );
    const clientMessageId = input.clientMessageId?.trim() || `dsh-local-${randomUUID()}`;
    const response = await this.fetchImpl(
      `${receipt.baseUrl}/api/internal/runtimes/deepseek-harness/local-turns`,
      {
        method: "POST",
        headers: {
          "X-Loop-Control-Token": receipt.controlToken,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          agentId: input.agentId,
          dshSessionId: input.dshSessionId,
          role: input.role,
          content: input.content,
          clientMessageId,
          target: input.target,
          title: input.title,
          syncMode: effectiveMode,
        }),
      },
    );
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Failed to sync local DSH turn (${response.status}): ${errText}`);
    }
    return (await response.json()) as LocalTurnSyncResponse;
  }

  /**
   * Subscribes to DSH `session/event` notifications and forwards strictly local
   * turns (never Loop-dispatched `source.kind === "loop-runtime"` turns) to `loop daemon`.
   */
  attachCordisSessionListener(
    ctx: CordisLikeContext,
    isLoopTurnActive: (sessionId: string) => boolean,
  ): () => void {
    if (!ctx.on) {
      return () => {};
    }
    const localTurnActive = new Set<string>();

    return ctx.on("session/event", (rawSession: unknown, rawEvent: unknown) => {
      const session = rawSession as { id?: string; title?: string } | undefined;
      const sessionId = session?.id?.trim();
      if (!sessionId) {
        return;
      }
      const config = this.configStore.read();
      const agentId = config.binding?.agentId;
      if (!agentId) {
        return;
      }

      const event = rawEvent as {
        seq?: number;
        type?: string;
        data?: Record<string, unknown>;
      };
      if (!event?.type) {
        return;
      }

      if (isLoopTurnActive(sessionId)) {
        localTurnActive.delete(sessionId);
        return;
      }

      const source = event.data?.source as { kind?: string } | undefined;
      if (source?.kind === LOOP_RUNTIME_SOURCE_KIND) {
        localTurnActive.delete(sessionId);
        return;
      }

      if (event.type === "user/message") {
        if (source?.kind && source.kind !== "user") {
          return;
        }
        const content = extractMessageText(event.data);
        if (!content) {
          return;
        }
        localTurnActive.add(sessionId);
        const msgId =
          typeof event.data?.id === "string" && event.data.id.trim()
            ? event.data.id.trim()
            : `dsh-user-${sessionId}-${event.seq ?? Date.now()}`;
        void this.syncLocalTurn({
          agentId,
          dshSessionId: sessionId,
          role: "user",
          content,
          clientMessageId: msgId,
          title: session?.title,
        }).catch(() => {});
        return;
      }

      if (event.type === "assistant/message" && localTurnActive.has(sessionId)) {
        const content = extractMessageText(event.data);
        if (!content) {
          return;
        }
        const msgId =
          typeof event.data?.id === "string" && event.data.id.trim()
            ? event.data.id.trim()
            : `dsh-assistant-${sessionId}-${event.seq ?? Date.now()}`;
        void this.syncLocalTurn({
          agentId,
          dshSessionId: sessionId,
          role: "assistant",
          content,
          clientMessageId: msgId,
          title: session?.title,
        }).catch(() => {});
        return;
      }

      if (event.type === "turn/end") {
        localTurnActive.delete(sessionId);
      }
    });
  }
}
