import WebSocket from "ws";

import type { DaemonReceipt } from "./daemon-manager.js";

export const DSH_REQUIRED_CAPABILITIES = [
  "session.open",
  "session.prompt.idempotent",
  "session.input-status",
  "session.input-surfaced",
  "session.cancel",
  "session.interrupt",
  "session.event",
  "session.status",
  "subagent.lifecycle",
] as const;

export const LOOP_RUNTIME_SOURCE_KIND = "loop-runtime";

export interface ContentBlock {
  type: string;
  text?: string;
}

export interface SessionOpenRequest {
  sessionId: string;
  mode: "create" | "resume" | string;
  agentId: string;
  loopScopeKey: string;
  workDir?: string;
  provider?: string;
  model?: string;
  loopEnv: Record<string, string>;
  baseInstructions: string;
  developerInstructions: string;
}

export interface SessionTurnRequest {
  sessionId: string;
  agentId: string;
  loopScopeKey: string;
  clientInputId: string;
  messageId: string;
  text: string;
  interrupt: boolean;
  signal: AbortSignal;
  workDir?: string;
  loopEnv: Record<string, string>;
  baseInstructions: string;
  developerInstructions: string;
  onTextDelta: (delta: string) => void;
  onUsage?: (usage: { inputTokens?: number; outputTokens?: number; totalTokens?: number }) => void;
}

export interface HostSessionAdapter {
  openSession(req: SessionOpenRequest): Promise<void>;
  runTurn(req: SessionTurnRequest): Promise<void>;
  closeSession?(sessionId: string): Promise<void>;
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface WireFrame {
  type: string;
  streamId?: string;
  agentId?: string;
  loopScopeKey?: string;
  sessionId?: string;
  reason?: string;
  error?: string;
  daemonInstanceId?: string;
  protocolVersion?: number;
  envelope?: JsonRpcRequest;
}

interface SurfacedInputRecord {
  messageId: string;
  eventSeq: number;
}

interface StreamState {
  streamId: string;
  agentId: string;
  loopScopeKey: string;
  sessionId: string;
  workDir?: string;
  provider?: string;
  model?: string;
  loopEnv: Record<string, string>;
  baseInstructions: string;
  developerInstructions: string;
  nextEventSeq: number;
  nextTurn: number;
  surfacedInputs: Map<string, SurfacedInputRecord>;
  activeAbort: AbortController | null;
  turnChain: Promise<void>;
}

export interface SessionRuntimeContext {
  agentId: string;
  loopScopeKey: string;
  loopEnv: Record<string, string>;
  baseInstructions: string;
  developerInstructions: string;
  workDir?: string;
}

export interface RuntimeBridgeOptions {
  resolveReceipt: () => Promise<DaemonReceipt | null> | DaemonReceipt | null;
  hostAdapter: HostSessionAdapter;
  hostVersion?: string;
  dshHome?: string;
  reconnectBaseDelayMs?: number;
  reconnectMaxDelayMs?: number;
  onStateChange?: (state: { connected: boolean; daemonInstanceId?: string }) => void;
}

/**
 * Multiplexed WebSocket client for `/api/internal/runtimes/deepseek-harness/attach`.
 * Bridges Loop Daemon JSON-RPC 2.0 session streams directly into live DSH sessions.
 */
export class RuntimeBridge {
  private readonly options: RuntimeBridgeOptions;
  private ws: WebSocket | null = null;
  private stopped = true;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempt = 0;
  private daemonInstanceId: string | undefined;
  private readonly streams = new Map<string, StreamState>();
  private readonly sessionContexts = new Map<string, SessionRuntimeContext>();
  private readonly activeLoopTurnCounts = new Map<string, number>();

  constructor(options: RuntimeBridgeOptions) {
    this.options = options;
  }

  get isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN && Boolean(this.daemonInstanceId);
  }

  get currentDaemonInstanceId(): string | undefined {
    return this.daemonInstanceId;
  }

  getSessionContext(sessionId: string): SessionRuntimeContext | undefined {
    return this.sessionContexts.get(sessionId);
  }

  isLoopTurnActive(sessionId: string): boolean {
    return (this.activeLoopTurnCounts.get(sessionId) ?? 0) > 0;
  }

  async connectOnce(): Promise<{ daemonInstanceId: string }> {
    const receipt = await this.options.resolveReceipt();
    if (!receipt) {
      throw new Error("No healthy loop daemon receipt available to attach runtime bridge");
    }
    if (this.ws) {
      this.closeCurrentSocket();
    }

    const wsUrl = receipt.baseUrl.replace(/^http:/i, "ws:") +
      "/api/internal/runtimes/deepseek-harness/attach";

    return await new Promise<{ daemonInstanceId: string }>((resolve, reject) => {
      let welcomed = false;
      const socket = new WebSocket(wsUrl, {
        headers: {
          "X-Loop-Control-Token": receipt.controlToken,
        },
        handshakeTimeout: 10_000,
      });
      this.ws = socket;

      socket.once("open", () => {
        const hello = {
          type: "host.hello",
          protocolVersion: 1,
          hostVersion: this.options.hostVersion ?? "2.0.0",
          dshHome: this.options.dshHome,
          capabilities: [...DSH_REQUIRED_CAPABILITIES],
        };
        socket.send(JSON.stringify(hello));
      });

      socket.on("message", (rawData) => {
        const text = typeof rawData === "string" ? rawData : rawData.toString("utf8");
        let frame: WireFrame;
        try {
          frame = JSON.parse(text) as WireFrame;
        } catch {
          return;
        }

        if (frame.type === "host.welcome") {
          welcomed = true;
          this.reconnectAttempt = 0;
          this.daemonInstanceId = frame.daemonInstanceId ?? "";
          this.options.onStateChange?.({
            connected: true,
            daemonInstanceId: this.daemonInstanceId,
          });
          resolve({ daemonInstanceId: this.daemonInstanceId });
          return;
        }

        if (frame.type === "host.error") {
          const err = new Error(frame.error || "Daemon rejected runtime attachment");
          if (!welcomed) {
            reject(err);
          }
          return;
        }

        if (frame.type === "session.eof" && frame.streamId) {
          this.teardownStream(frame.streamId);
          return;
        }

        if (frame.type === "session.rpc" && frame.streamId && frame.envelope) {
          void this.handleRpcFrame(frame.streamId, frame);
        }
      });

      socket.once("error", (err) => {
        if (!welcomed) {
          reject(err);
        }
      });

      socket.once("close", () => {
        if (this.ws === socket) {
          this.ws = null;
          this.daemonInstanceId = undefined;
          this.abortAllStreams();
          this.options.onStateChange?.({ connected: false });
          if (!this.stopped) {
            this.scheduleReconnect();
          }
        }
        if (!welcomed) {
          reject(new Error("Runtime attachment WebSocket closed before host.welcome"));
        }
      });
    });
  }

  async start(): Promise<void> {
    this.stopped = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    try {
      await this.connectOnce();
    } catch {
      if (!this.stopped) {
        this.scheduleReconnect();
      }
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.abortAllStreams();
    this.closeCurrentSocket();
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer) {
      return;
    }
    const baseDelay = this.options.reconnectBaseDelayMs ?? 500;
    const maxDelay = this.options.reconnectMaxDelayMs ?? 10_000;
    const delay = Math.min(maxDelay, baseDelay * Math.pow(2, this.reconnectAttempt++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) {
        void this.start();
      }
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private closeCurrentSocket(): void {
    const socket = this.ws;
    this.ws = null;
    this.daemonInstanceId = undefined;
    if (socket) {
      try {
        socket.close();
      } catch {
        // Ignore socket close error.
      }
    }
  }

  private abortAllStreams(): void {
    for (const streamId of Array.from(this.streams.keys())) {
      this.teardownStream(streamId);
    }
  }

  private teardownStream(streamId: string): void {
    const stream = this.streams.get(streamId);
    if (!stream) {
      return;
    }
    this.streams.delete(streamId);
    stream.activeAbort?.abort(new Error("stream closed"));
  }

  private ensureStream(streamId: string, frame: WireFrame): StreamState {
    let stream = this.streams.get(streamId);
    if (!stream) {
      stream = {
        streamId,
        agentId: frame.agentId ?? "",
        loopScopeKey: frame.loopScopeKey ?? "",
        sessionId: frame.sessionId ?? "",
        loopEnv: {},
        baseInstructions: "",
        developerInstructions: "",
        nextEventSeq: 0,
        nextTurn: 0,
        surfacedInputs: new Map(),
        activeAbort: null,
        turnChain: Promise.resolve(),
      };
      this.streams.set(streamId, stream);
    }
    if (frame.agentId) {
      stream.agentId = frame.agentId;
    }
    if (frame.loopScopeKey) {
      stream.loopScopeKey = frame.loopScopeKey;
    }
    return stream;
  }

  private sendEnvelope(streamId: string, envelope: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(
      JSON.stringify({
        type: "session.rpc",
        streamId,
        envelope,
      }),
    );
  }

  private sendResult(streamId: string, id: string | number | undefined, result: Record<string, unknown>): void {
    if (id === undefined) {
      return;
    }
    this.sendEnvelope(streamId, {
      jsonrpc: "2.0",
      id,
      result,
    });
  }

  private sendError(
    streamId: string,
    id: string | number | undefined,
    code: number,
    message: string,
  ): void {
    if (id === undefined) {
      return;
    }
    this.sendEnvelope(streamId, {
      jsonrpc: "2.0",
      id,
      error: { code, message },
    });
  }

  private sendNotification(streamId: string, method: string, params: Record<string, unknown>): void {
    this.sendEnvelope(streamId, {
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  private emitSessionEvent(
    stream: StreamState,
    sessionId: string,
    type: string,
    data: Record<string, unknown>,
  ): number {
    const seq = stream.nextEventSeq++;
    this.sendNotification(stream.streamId, "session.event", {
      sessionId,
      event: {
        seq,
        time: Date.now(),
        type,
        data,
      },
    });
    return seq;
  }

  private enterLoopTurn(sessionId: string): void {
    this.activeLoopTurnCounts.set(sessionId, (this.activeLoopTurnCounts.get(sessionId) ?? 0) + 1);
  }

  private exitLoopTurn(sessionId: string): void {
    const next = (this.activeLoopTurnCounts.get(sessionId) ?? 1) - 1;
    if (next <= 0) {
      this.activeLoopTurnCounts.delete(sessionId);
    } else {
      this.activeLoopTurnCounts.set(sessionId, next);
    }
  }

  private async handleRpcFrame(streamId: string, frame: WireFrame): Promise<void> {
    const req = frame.envelope;
    if (!req || req.jsonrpc !== "2.0" || typeof req.method !== "string") {
      return;
    }
    const stream = this.ensureStream(streamId, frame);
    const params = (req.params ?? {}) as Record<string, unknown>;

    try {
      switch (req.method) {
        case "initialize": {
          if (typeof params.agentId === "string" && params.agentId.trim()) {
            stream.agentId = params.agentId.trim();
          }
          if (typeof params.loopScopeKey === "string" && params.loopScopeKey.trim()) {
            stream.loopScopeKey = params.loopScopeKey.trim();
          }
          if (typeof params.workDir === "string") {
            stream.workDir = params.workDir;
          }
          if (typeof params.provider === "string") {
            stream.provider = params.provider;
          }
          if (typeof params.model === "string") {
            stream.model = params.model;
          }
          if (typeof params.baseInstructions === "string") {
            stream.baseInstructions = params.baseInstructions;
          }
          if (typeof params.developerInstructions === "string") {
            stream.developerInstructions = params.developerInstructions;
          }
          if (params.loopEnv && typeof params.loopEnv === "object") {
            const envMap: Record<string, string> = {};
            for (const [k, v] of Object.entries(params.loopEnv as Record<string, unknown>)) {
              if (typeof v === "string") {
                envMap[k] = v;
              }
            }
            stream.loopEnv = envMap;
          }
          this.sendResult(streamId, req.id, {
            protocolVersion: 1,
            capabilities: {
              supported: [...DSH_REQUIRED_CAPABILITIES],
            },
            serverInfo: {
              name: "loop-dsh",
              version: this.options.hostVersion ?? "2.0.0",
            },
          });
          return;
        }

        case "session/open": {
          const sessionId = typeof params.sessionId === "string" ? params.sessionId.trim() : "";
          const mode = typeof params.mode === "string" ? params.mode : "create";
          if (!sessionId) {
            this.sendError(streamId, req.id, -32602, "sessionId is required");
            return;
          }
          stream.sessionId = sessionId;
          const context: SessionRuntimeContext = {
            agentId: stream.agentId,
            loopScopeKey: stream.loopScopeKey,
            loopEnv: { ...stream.loopEnv },
            baseInstructions: stream.baseInstructions,
            developerInstructions: stream.developerInstructions,
            workDir: stream.workDir,
          };
          this.sessionContexts.set(sessionId, context);

          await this.options.hostAdapter.openSession({
            sessionId,
            mode,
            agentId: stream.agentId,
            loopScopeKey: stream.loopScopeKey,
            workDir: stream.workDir,
            provider: stream.provider,
            model: stream.model,
            loopEnv: context.loopEnv,
            baseInstructions: stream.baseInstructions,
            developerInstructions: stream.developerInstructions,
          });
          this.sendResult(streamId, req.id, { sessionId, mode });
          return;
        }

        case "session/prompt":
        case "session/interrupt": {
          const sessionId =
            typeof params.sessionId === "string" ? params.sessionId.trim() : stream.sessionId;
          const clientInputId =
            typeof params.clientInputId === "string" ? params.clientInputId.trim() : "";
          const blocks = Array.isArray(params.contentBlocks)
            ? (params.contentBlocks as ContentBlock[])
            : [];
          if (!sessionId || !clientInputId) {
            this.sendError(streamId, req.id, -32602, "sessionId and clientInputId are required");
            return;
          }

          const existing = stream.surfacedInputs.get(clientInputId);
          if (existing) {
            this.sendResult(streamId, req.id, {
              sessionId,
              clientInputId,
              messageId: existing.messageId,
            });
            return;
          }

          const isInterrupt = req.method === "session/interrupt";
          if (isInterrupt && stream.activeAbort) {
            stream.activeAbort.abort(new Error("interrupted"));
          }

          const messageId = `dsh-${clientInputId}`;
          const text = blocks
            .filter((block) => block && block.type === "text" && typeof block.text === "string")
            .map((block) => block.text ?? "")
            .join("\n");

          this.sendResult(streamId, req.id, {
            sessionId,
            clientInputId,
            messageId,
          });

          stream.turnChain = stream.turnChain
            .catch(() => {})
            .then(async () => {
              if (!this.streams.has(streamId)) {
                return;
              }
              const abortController = new AbortController();
              stream.activeAbort = abortController;
              const turn = stream.nextTurn++;
              this.enterLoopTurn(sessionId);

              try {
                this.sendNotification(streamId, "session.status", {
                  sessionId,
                  status: "running",
                });
                this.emitSessionEvent(stream, sessionId, "turn/start", { turn });
                const userEventSeq = this.emitSessionEvent(stream, sessionId, "user/message", {
                  id: messageId,
                });
                stream.surfacedInputs.set(clientInputId, {
                  messageId,
                  eventSeq: userEventSeq,
                });
                this.sendNotification(streamId, "session.input-surfaced", {
                  sessionId,
                  clientInputId,
                  messageId,
                  eventSeq: userEventSeq,
                });

                await this.options.hostAdapter.runTurn({
                  sessionId,
                  agentId: stream.agentId,
                  loopScopeKey: stream.loopScopeKey,
                  clientInputId,
                  messageId,
                  text,
                  interrupt: isInterrupt,
                  signal: abortController.signal,
                  workDir: stream.workDir,
                  loopEnv: { ...stream.loopEnv },
                  baseInstructions: stream.baseInstructions,
                  developerInstructions: stream.developerInstructions,
                  onTextDelta: (delta: string) => {
                    if (delta) {
                      this.emitSessionEvent(stream, sessionId, "assistant/chunk", {
                        turn,
                        step: 0,
                        chunk: {
                          type: "text-delta",
                          text: delta,
                        },
                      });
                    }
                  },
                  onUsage: (usage) => {
                    this.emitSessionEvent(stream, sessionId, "assistant/message", {
                      usage,
                    });
                  },
                });

                if (abortController.signal.aborted) {
                  const reasonText = String(abortController.signal.reason ?? "");
                  const kind = reasonText.includes("interrupted") ? "interrupted" : "aborted";
                  this.emitSessionEvent(stream, sessionId, "turn/end", {
                    turn,
                    reason: kind === "aborted" ? { kind, reason: { kind: "user" } } : { kind },
                  });
                } else {
                  this.emitSessionEvent(stream, sessionId, "turn/end", {
                    turn,
                    reason: { kind: "completed" },
                  });
                }
              } catch (turnErr) {
                if (abortController.signal.aborted) {
                  const reasonText = String(abortController.signal.reason ?? "");
                  const kind = reasonText.includes("interrupted") ? "interrupted" : "aborted";
                  this.emitSessionEvent(stream, sessionId, "turn/end", {
                    turn,
                    reason: kind === "aborted" ? { kind, reason: { kind: "user" } } : { kind },
                  });
                } else {
                  const errMsg = turnErr instanceof Error ? turnErr.message : String(turnErr);
                  this.emitSessionEvent(stream, sessionId, "turn/end", {
                    turn,
                    reason: {
                      kind: "error",
                      error: {
                        message: errMsg,
                        code: "dsh_turn_error",
                      },
                    },
                  });
                }
              } finally {
                if (stream.activeAbort === abortController) {
                  stream.activeAbort = null;
                }
                this.exitLoopTurn(sessionId);
                this.sendNotification(streamId, "session.status", {
                  sessionId,
                  status: "idle",
                });
              }
            });
          return;
        }

        case "session/input-status": {
          const sessionId =
            typeof params.sessionId === "string" ? params.sessionId.trim() : stream.sessionId;
          const clientInputId =
            typeof params.clientInputId === "string" ? params.clientInputId.trim() : "";
          const found = stream.surfacedInputs.get(clientInputId);
          if (found) {
            this.sendResult(streamId, req.id, {
              sessionId,
              clientInputId,
              messageId: found.messageId,
              status: "surfaced",
            });
          } else {
            this.sendResult(streamId, req.id, {
              sessionId,
              clientInputId,
              status: "absent",
            });
          }
          return;
        }

        case "session/cancel": {
          const sessionId =
            typeof params.sessionId === "string" ? params.sessionId.trim() : stream.sessionId;
          const keepInbox = Boolean(params.keepInbox);
          stream.activeAbort?.abort(new Error("cancelled"));
          this.sendResult(streamId, req.id, {
            sessionId,
            keepInbox,
          });
          return;
        }

        case "shutdown": {
          const sessionId = stream.sessionId;
          this.teardownStream(streamId);
          if (sessionId && this.options.hostAdapter.closeSession) {
            await this.options.hostAdapter.closeSession(sessionId);
          }
          this.sendResult(streamId, req.id, {});
          return;
        }

        default:
          this.sendError(streamId, req.id, -32601, `Unsupported method: ${req.method}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.sendError(streamId, req.id, -32603, msg);
    }
  }
}

/**
 * Adapts a DeepSeek Harness Cordis host context (`sessionController`, `agents`,
 * `systemPrompt`, `on("session/event")`) to `HostSessionAdapter`.
 */
export interface CordisLikeContext {
  get?(name: string): unknown;
  on?(event: string, listener: (...args: unknown[]) => void): () => void;
  agents?: {
    get?(sessionId: string): DshAgentHandle | undefined;
  };
  systemPrompt?: {
    context?(spec: {
      name: string;
      order?: number;
      text: (args: { agent?: { session?: { id?: string } } }) => string | undefined;
    }): () => void;
  };
}

interface DshAgentHandle {
  session?: { id?: string };
  abort?(): void | Promise<void>;
  send(
    message: {
      id: string;
      role: "user";
      content: Array<{ type: "text"; text: string }>;
      source: { kind: string; clientInputId: string };
    },
    target: "next-turn" | "next-step",
    triggerTurn: boolean,
  ): Promise<void> | void;
}

interface DshSessionController {
  create?(options?: { sessionId?: string; workspaceId?: string; cwd?: string }): Promise<{ id?: string; sessionId?: string }>;
  resolveAgent?(sessionId: string): Promise<{ agent: DshAgentHandle }>;
}

export function createCordisHostAdapter(
  ctx: CordisLikeContext,
  getSessionContext: (sessionId: string) => SessionRuntimeContext | undefined,
): { adapter: HostSessionAdapter; dispose: () => void } {
  const disposers: Array<() => void> = [];

  if (ctx.systemPrompt?.context) {
    const disposePrompt = ctx.systemPrompt.context({
      name: "loop-dsh-instructions",
      order: 10,
      text: ({ agent }) => {
        const sessionId = agent?.session?.id;
        if (!sessionId) {
          return undefined;
        }
        const runtimeCtx = getSessionContext(sessionId);
        if (!runtimeCtx) {
          return undefined;
        }
        const parts = [runtimeCtx.baseInstructions, runtimeCtx.developerInstructions]
          .map((item) => item.trim())
          .filter(Boolean);
        return parts.length > 0 ? parts.join("\n\n") : undefined;
      },
    });
    if (typeof disposePrompt === "function") {
      disposers.push(disposePrompt);
    }
  }

  const resolveAgent = async (sessionId: string, workDir?: string): Promise<DshAgentHandle> => {
    const direct = ctx.agents?.get?.(sessionId);
    if (direct) {
      return direct;
    }
    const controller = ctx.get?.("sessionController") as DshSessionController | undefined;
    if (controller?.resolveAgent) {
      try {
        const resolved = await controller.resolveAgent(sessionId);
        if (resolved?.agent) {
          return resolved.agent;
        }
      } catch {
        if (controller.create) {
          await controller.create({ sessionId, cwd: workDir });
          const created = await controller.resolveAgent(sessionId);
          if (created?.agent) {
            return created.agent;
          }
        }
      }
    }
    throw new Error(`DSH sessionController could not resolve session "${sessionId}"`);
  };

  const adapter: HostSessionAdapter = {
    async openSession(req: SessionOpenRequest): Promise<void> {
      for (const [key, value] of Object.entries(req.loopEnv)) {
        process.env[key] = value;
      }
      if (ctx.agents || ctx.get?.("sessionController")) {
        await resolveAgent(req.sessionId, req.workDir);
      }
    },

    async runTurn(req: SessionTurnRequest): Promise<void> {
      for (const [key, value] of Object.entries(req.loopEnv)) {
        process.env[key] = value;
      }
      const agent = await resolveAgent(req.sessionId, req.workDir);
      if (req.interrupt && agent.abort) {
        await agent.abort();
      }

      await new Promise<void>((resolve, reject) => {
        let finished = false;
        let unsubscribeEvent: (() => void) | undefined;

        const cleanup = () => {
          finished = true;
          unsubscribeEvent?.();
          req.signal.removeEventListener("abort", onAbort);
        };

        const onAbort = () => {
          void Promise.resolve(agent.abort?.()).finally(() => {
            if (!finished) {
              cleanup();
              resolve();
            }
          });
        };
        req.signal.addEventListener("abort", onAbort, { once: true });

        if (ctx.on) {
          unsubscribeEvent = ctx.on("session/event", (rawSession: unknown, rawEvent: unknown) => {
            const session = rawSession as { id?: string } | undefined;
            if (!session || session.id !== req.sessionId) {
              return;
            }
            const event = rawEvent as {
              type?: string;
              data?: Record<string, unknown>;
            };
            if (event.type === "assistant/chunk") {
              const chunk = event.data?.chunk as { type?: string; text?: string } | undefined;
              if (chunk?.type === "text-delta" && typeof chunk.text === "string") {
                req.onTextDelta(chunk.text);
              }
            } else if (event.type === "assistant/message" && req.onUsage) {
              const usage = event.data?.usage as
                | { inputTokens?: number; outputTokens?: number; totalTokens?: number }
                | undefined;
              if (usage) {
                req.onUsage(usage);
              }
            } else if (event.type === "turn/end") {
              if (!finished) {
                cleanup();
                resolve();
              }
            }
          });
        }

        Promise.resolve(
          agent.send(
            {
              id: req.messageId,
              role: "user",
              content: [{ type: "text", text: req.text }],
              source: {
                kind: LOOP_RUNTIME_SOURCE_KIND,
                clientInputId: req.clientInputId,
              },
            },
            req.interrupt ? "next-step" : "next-turn",
            true,
          ),
        ).then(() => {
          if (!ctx.on && !finished) {
            cleanup();
            resolve();
          }
        }, (err) => {
          if (!finished) {
            cleanup();
            reject(err);
          }
        });
      });
    },
  };

  return {
    adapter,
    dispose: () => {
      for (const dispose of disposers) {
        dispose();
      }
    },
  };
}
