import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WebSocketServer, type WebSocket as WsSocket } from "ws";

import {
  ConfigStore,
  createCordisHostAdapter,
  type DaemonReceipt,
  LocalTurnSyncClient,
  LOOP_RUNTIME_SOURCE_KIND,
  RuntimeBridge,
} from "../src/index.js";

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

test("RuntimeBridge multiplexes JSON-RPC 2.0 sessions with contiguous event sequences and idempotency", async () => {
  const controlToken = "control-test-token-bridge";
  let activeHostSocket: WsSocket | null = null;
  const inboundFrames: Array<Record<string, unknown>> = [];
  let frameWaiters: Array<() => void> = [];

  const httpServer = createServer((req, res) => {
    if (req.headers.origin) {
      res.writeHead(403);
      res.end();
      return;
    }
    if (req.headers["x-loop-control-token"] !== controlToken) {
      res.writeHead(401);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ noServer: true });
  httpServer.on("upgrade", (req, socket, head) => {
    if (
      req.url !== "/api/internal/runtimes/deepseek-harness/attach" ||
      req.headers.origin ||
      req.headers["x-loop-control-token"] !== controlToken
    ) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      activeHostSocket = ws;
      ws.on("message", (raw) => {
        const parsed = JSON.parse(raw.toString("utf8")) as Record<string, unknown>;
        if (parsed.type === "host.hello") {
          ws.send(
            JSON.stringify({
              type: "host.welcome",
              protocolVersion: 1,
              daemonInstanceId: "inst-bridge-1",
            }),
          );
          return;
        }
        inboundFrames.push(parsed);
        for (const notify of frameWaiters.splice(0)) {
          notify();
        }
      });
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(0, "127.0.0.1", () => resolve()));
  const port = (httpServer.address() as AddressInfo).port;
  const receipt: DaemonReceipt = {
    schemaVersion: 1,
    desktopApiVersion: 2,
    instanceId: "inst-bridge-1",
    pid: process.pid,
    baseUrl: `http://127.0.0.1:${port}`,
    controlToken,
  };

  let promptExecutions = 0;
  const bridge = new RuntimeBridge({
    resolveReceipt: () => receipt,
    hostAdapter: {
      async openSession() {},
      async runTurn(req) {
        promptExecutions++;
        req.onTextDelta(`Reply to: ${req.text}`);
        req.onUsage?.({ inputTokens: 12, outputTokens: 8, totalTokens: 20 });
      },
    },
  });

  const waitForFrames = async (predicate: () => boolean, timeoutMs = 3_000): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate()) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(`Timed out waiting for frames; got: ${JSON.stringify(inboundFrames)}`);
      }
      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, Math.min(remaining, 100));
        frameWaiters.push(() => {
          clearTimeout(timer);
          resolve();
        });
      });
    }
  };

  try {
    const welcome = await bridge.connectOnce();
    assert.equal(welcome.daemonInstanceId, "inst-bridge-1");
    assert.equal(bridge.isConnected, true);

    const sendRpc = (id: string, method: string, params: Record<string, unknown>) => {
      activeHostSocket!.send(
        JSON.stringify({
          type: "session.rpc",
          streamId: "stream-1",
          agentId: "agt_1",
          loopScopeKey: "agt_1:conv:scope:dm:dm_1",
          envelope: { jsonrpc: "2.0", id, method, params },
        }),
      );
    };

    sendRpc("1", "initialize", {
      agentId: "agt_1",
      loopScopeKey: "agt_1:conv:scope:dm:dm_1",
      baseInstructions: "You are a Loop teammate.",
      developerInstructions: "Reply concisely.",
      loopEnv: {
        LOOP_EXEC_BASE_URL: "http://127.0.0.1:19999",
      },
    });
    await waitForFrames(() => inboundFrames.length >= 1);

    sendRpc("2", "session/open", {
      sessionId: "dsh_sess_1",
      mode: "create",
    });
    await waitForFrames(() => inboundFrames.length >= 2);

    sendRpc("3", "session/prompt", {
      sessionId: "dsh_sess_1",
      clientInputId: "inp_1",
      contentBlocks: [{ type: "text", text: "Hello from Loop" }],
    });

    await waitForFrames(() =>
      inboundFrames.some((f) => {
        const env = f.envelope as Record<string, unknown> | undefined;
        const params = env?.params as Record<string, unknown> | undefined;
        return env?.method === "session.status" && params?.status === "idle";
      }),
    );

    assert.equal(promptExecutions, 1);

    // Verify strict contiguous event seq (0, 1, 2, 3, 4) and surfaced ordering!
    const envelopes = inboundFrames.map((f) => f.envelope as Record<string, unknown>);
    const sessionEvents = envelopes.filter((e) => e.method === "session.event");
    const seqs = sessionEvents.map(
      (e) => ((e.params as Record<string, unknown>).event as Record<string, unknown>).seq,
    );
    assert.deepEqual(seqs, [0, 1, 2, 3, 4]);

    const surfacedIdx = envelopes.findIndex((e) => e.method === "session.input-surfaced");
    const userMsgIdx = envelopes.findIndex(
      (e) =>
        e.method === "session.event" &&
        ((e.params as Record<string, unknown>).event as Record<string, unknown>).type ===
          "user/message",
    );
    assert.ok(userMsgIdx >= 0 && surfacedIdx > userMsgIdx);

    // Verify idempotency: re-sending clientInputId "inp_1" does NOT re-execute runTurn.
    const countBeforeReplay = inboundFrames.length;
    sendRpc("4", "session/prompt", {
      sessionId: "dsh_sess_1",
      clientInputId: "inp_1",
      contentBlocks: [{ type: "text", text: "Hello from Loop" }],
    });
    await waitForFrames(() => inboundFrames.length > countBeforeReplay);
    assert.equal(promptExecutions, 1);

    // Verify session/input-status returns surfaced.
    const countBeforeStatus = inboundFrames.length;
    sendRpc("5", "session/input-status", {
      sessionId: "dsh_sess_1",
      clientInputId: "inp_1",
    });
    await waitForFrames(() => inboundFrames.length > countBeforeStatus);
    const statusReply = inboundFrames[inboundFrames.length - 1]!.envelope as Record<string, unknown>;
    assert.equal((statusReply.result as Record<string, unknown>).status, "surfaced");
  } finally {
    await bridge.stop();
    wss.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  }
});

test("LocalTurnSyncClient forwards local turns, suppresses loop-runtime echoes, and honors local_only", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "loop-dsh-sync-"));
  const controlToken = "control-test-token-sync";
  const localTurnRequests: Array<Record<string, unknown>> = [];
  const bindingRequests: Array<Record<string, unknown>> = [];

  const server = createServer(async (req, res) => {
    if (req.headers["x-loop-control-token"] !== controlToken || req.headers.origin) {
      res.writeHead(401);
      res.end();
      return;
    }
    if (req.method === "POST" && req.url === "/api/internal/runtimes/deepseek-harness/bindings") {
      const body = await readJsonBody(req);
      bindingRequests.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          binding: {
            agentId: body.agentId,
            loopScopeKey: body.agentId,
            dshSessionId: body.dshSessionId,
            syncMode: body.syncMode ?? "synced",
            updatedAt: new Date().toISOString(),
          },
        }),
      );
      return;
    }
    if (req.method === "POST" && req.url === "/api/internal/runtimes/deepseek-harness/local-turns") {
      const body = await readJsonBody(req);
      localTurnRequests.push(body);
      const mode = (body.syncMode as string) || "synced";
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          synced: mode === "synced",
          syncMode: mode,
          messageId: mode === "synced" ? "msg_1" : undefined,
        }),
      );
      return;
    }
    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const receipt: DaemonReceipt = {
    schemaVersion: 1,
    desktopApiVersion: 2,
    instanceId: "inst-sync-1",
    pid: process.pid,
    baseUrl: `http://127.0.0.1:${port}`,
    controlToken,
  };

  try {
    const store = new ConfigStore(join(workDir, "state"));
    store.update((cfg) => ({
      ...cfg,
      binding: {
        serverUrl: "https://loop.pingcap.cn",
        workspaceId: "wsp_1",
        machineId: "mac_1",
        machineName: "Mac",
        agentId: "agt_sync_1",
        agentName: "DSH Agent",
        isSuperAgent: true,
      },
    }));

    const syncClient = new LocalTurnSyncClient({
      configStore: store,
      resolveReceipt: () => receipt,
    });

    const eventListeners: Array<(session: unknown, event: unknown) => void> = [];
    const fakeCordis = {
      on(event: string, listener: (...args: unknown[]) => void) {
        if (event === "session/event") {
          eventListeners.push(listener as (session: unknown, event: unknown) => void);
        }
        return () => {};
      },
    };
    const emitEvent = (sessionId: string, event: Record<string, unknown>) => {
      for (const listener of eventListeners) {
        listener({ id: sessionId, title: "Test Session" }, event);
      }
    };

    syncClient.attachCordisSessionListener(fakeCordis, () => false);
    createCordisHostAdapter(fakeCordis, () => undefined);

    // 1. Loop-originated message (source.kind === "loop-runtime") MUST NOT echo back.
    emitEvent("sess-1", {
      seq: 1,
      type: "user/message",
      data: {
        id: "m-loop-1",
        content: [{ type: "text", text: "From Loop" }],
        source: { kind: LOOP_RUNTIME_SOURCE_KIND, clientInputId: "inp-1" },
      },
    });
    await new Promise((r) => setTimeout(r, 50));
    assert.equal(localTurnRequests.length, 0);

    // 2. Local human message (source.kind === "user") + assistant reply syncs cleanly.
    emitEvent("sess-1", {
      seq: 2,
      type: "user/message",
      data: {
        id: "m-local-user-1",
        content: [{ type: "text", text: "Local prompt in DSH" }],
        source: { kind: "user" },
      },
    });
    emitEvent("sess-1", {
      seq: 3,
      type: "assistant/message",
      data: {
        id: "m-local-assistant-1",
        content: [{ type: "text", text: "Local answer in DSH" }],
      },
    });
    await new Promise((r) => setTimeout(r, 80));
    assert.equal(localTurnRequests.length, 2);
    assert.equal(localTurnRequests[0]!.role, "user");
    assert.equal(localTurnRequests[0]!.syncMode, "synced");
    assert.equal(localTurnRequests[1]!.role, "assistant");

    // 3. Switching session to local_only persists mode and marks turns local_only.
    await syncClient.setSessionSyncMode("sess-private", "local_only");
    assert.equal(bindingRequests.length, 1);
    assert.equal(bindingRequests[0]!.syncMode, "local_only");

    const localOnlyResult = await syncClient.syncLocalTurn({
      agentId: "agt_sync_1",
      dshSessionId: "sess-private",
      role: "user",
      content: "Private scratch note",
    });
    assert.equal(localOnlyResult.synced, false);
    assert.equal(localOnlyResult.syncMode, "local_only");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workDir, { recursive: true, force: true });
  }
});
