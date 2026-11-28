import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createServer, type IncomingMessage } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loopBinaryFilename, LoopDshService } from "../src/index.js";
import { buildTarGz } from "./helpers/tar.js";

const HEADLESS_BIN_PATH = process.env.LOOP_HEADLESS_BIN || "/tmp/loop-headless";

async function readBodyText(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

test(
  "E2E with real headless loop binary: OAuth PKCE bootstrap -> SHA-256 auto-download -> loop daemon -> attach & bindings",
  { skip: !existsSync(HEADLESS_BIN_PATH) ? `Headless binary not found at ${HEADLESS_BIN_PATH}` : false },
  async () => {
    const workDir = mkdtempSync(join(tmpdir(), "loop-dsh-headless-e2e-"));
    const stateDir = join(workDir, "plugin-state");
    const loopConfigDir = join(workDir, "dot-loop");

    // Package the real compiled /tmp/loop-headless binary into a .tar.gz archive!
    const binName = loopBinaryFilename();
    const realBinaryBytes = readFileSync(HEADLESS_BIN_PATH);
    const archiveBytes = buildTarGz([
      { name: binName, content: realBinaryBytes, mode: 0o755 },
    ]);
    const archiveSha256 = createHash("sha256").update(archiveBytes).digest("hex");

    let savedChallenge = "";
    let savedRedirectUri = "";
    let connectExchanged = false;
    let mockServerUrl = "";

    const mockLoopServer = createServer(async (req, res) => {
      const reqUrl = new URL(req.url ?? "/", mockServerUrl || "http://127.0.0.1");

      if (req.method === "POST" && reqUrl.pathname === "/api/v1/auth/oauth/register") {
        const body = JSON.parse(await readBodyText(req)) as { redirect_uris: string[] };
        savedRedirectUri = body.redirect_uris[0] ?? "";
        res.writeHead(201, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            client_id: "oac_e2e_1",
            client_name: "Loop for DeepSeek Harness",
            redirect_uris: body.redirect_uris,
            token_endpoint_auth_method: "none",
          }),
        );
        return;
      }

      if (req.method === "GET" && reqUrl.pathname === "/api/v1/auth/oauth/authorize") {
        savedChallenge = reqUrl.searchParams.get("code_challenge") ?? "";
        const state = reqUrl.searchParams.get("state") ?? "";
        const redirectUri = reqUrl.searchParams.get("redirect_uri") ?? savedRedirectUri;
        const callback = new URL(redirectUri);
        callback.searchParams.set("code", "auth_code_e2e_1");
        callback.searchParams.set("state", state);
        res.writeHead(302, { Location: callback.toString() });
        res.end();
        return;
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/v1/auth/oauth/token") {
        const form = new URLSearchParams(await readBodyText(req));
        const verifier = form.get("code_verifier") ?? "";
        const computedChallenge = createHash("sha256").update(verifier).digest("base64url");
        if (computedChallenge !== savedChallenge) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "invalid_grant", error_description: "PKCE mismatch" }));
          return;
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            grant_id: "oag_e2e_1",
            workspace_id: "wsp_e2e_1",
            access_token: "oat_e2e_access_1",
            refresh_token: "ort_e2e_refresh_1",
            token_type: "Bearer",
            expires_in: 900,
            scope: "loop.machine.bootstrap offline_access",
            resource: `${mockServerUrl}/api/v1/auth/oauth/bootstrap`,
          }),
        );
        return;
      }

      if (req.method === "GET" && reqUrl.pathname === "/api/v1/auth/oauth/bootstrap/context") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            serverUrl: mockServerUrl,
            workspaceId: "wsp_e2e_1",
            workspaceName: "Loop E2E Workspace",
            workspaceSlug: "loop-e2e",
            userId: "usr_1",
            memberId: "mem_1",
            machines: [],
            agents: [],
            daemonArtifact: {
              version: "v2.0.0-e2e",
              archiveUrl: `${mockServerUrl}/internal/daemon-artifacts/loop-headless.tar.gz`,
              sha256: archiveSha256,
            },
          }),
        );
        return;
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/v1/auth/oauth/bootstrap") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            serverUrl: mockServerUrl,
            workspaceId: "wsp_e2e_1",
            machine: {
              id: "mac_e2e_1",
              name: "DSH E2E Machine",
              connectToken: "mct_e2e_connect_1",
            },
            agent: {
              id: "agt_e2e_1",
              memberId: "mem_agt_1",
              name: "dsh-assistant",
              displayName: "DSH Assistant",
              machineId: "mac_e2e_1",
              runtime: "deepseek-harness",
              sessionMode: "conversation",
              isSuperAgent: true,
            },
            daemonArtifact: {
              version: "v2.0.0-e2e",
              archiveUrl: `${mockServerUrl}/internal/daemon-artifacts/loop-headless.tar.gz`,
              sha256: archiveSha256,
            },
          }),
        );
        return;
      }

      if (req.method === "GET" && reqUrl.pathname === "/internal/daemon-artifacts/loop-headless.tar.gz") {
        res.writeHead(200, { "Content-Type": "application/gzip" });
        res.end(archiveBytes);
        return;
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/v1/machine-connect-exchanges") {
        const body = JSON.parse(await readBodyText(req)) as { token?: string };
        assert.equal(body.token, "mct_e2e_connect_1");
        connectExchanged = true;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            machineId: "mac_e2e_1",
            apiKey: "lak_e2e_machine_key_1",
            serverUrl: mockServerUrl,
            workspaceId: "wsp_e2e_1",
          }),
        );
        return;
      }

      if (req.method === "POST" && reqUrl.pathname === "/api/v1/auth/oauth/revoke") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
    });

    await new Promise<void>((resolve) => mockLoopServer.listen(0, "127.0.0.1", () => resolve()));
    const serverPort = (mockLoopServer.address() as AddressInfo).port;
    mockServerUrl = `http://127.0.0.1:${serverPort}`;

    // Deliberately include LOOP_EXEC_* in env to verify child-env sanitization against real binary!
    const pollutedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      HOME: workDir,
      PATH: "/usr/bin:/bin:/usr/sbin:/sbin",
      LOOP_EXEC_BASE_URL: "http://127.0.0.1:65530",
      LOOP_EXEC_TOKEN_FILE: "/tmp/nonexistent-exec-token",
    };

    const service = new LoopDshService({
      stateDir,
      loopConfigDir,
      autoDownloadBinary: true,
      dshHome: join(workDir, "dsh-home"),
      env: pollutedEnv,
      startupTimeoutMs: 20_000,
    });

    try {
      // Configure custom Loop server URL explicitly first.
      const configured = service.configure({ loopServerUrl: mockServerUrl });
      assert.equal(configured.loopServerUrl, mockServerUrl);

      // Run full OAuth PKCE login + Machine/Agent bootstrap + auto-download binary + start real loop daemon + attach!
      const bootResult = await service.loginAndBootstrap({
        machineName: "DSH E2E Machine",
        agentName: "DSH Assistant",
        isSuperAgent: true,
        openBrowser: false,
        onAuthorizeUrl: async (authorizeUrl) => {
          const authRes = await fetch(authorizeUrl, { redirect: "follow" });
          assert.equal(authRes.status, 200);
        },
      });

      // 1. Verify headless binary was auto-downloaded & extracted to <loopConfigDir>/bin/loop!
      const expectedDownloadedBin = join(loopConfigDir, "bin", binName);
      assert.equal(existsSync(expectedDownloadedBin), true);

      // 2. Verify `loop connect` exchanged the one-time connectToken and wrote servers.yaml!
      assert.equal(connectExchanged, true);
      assert.equal(existsSync(join(loopConfigDir, "servers.yaml")), true);

      // 3. Verify real `loop daemon` receipt (`run/daemon.json`) and live WebSocket attachment!
      assert.equal(existsSync(join(loopConfigDir, "run", "daemon.json")), true);
      assert.equal(bootResult.binding.machineId, "mac_e2e_1");
      assert.equal(bootResult.binding.agentId, "agt_e2e_1");
      assert.equal(service.runtimeBridge.isConnected, true);

      const snapshot = await service.getStatus();
      assert.equal(snapshot.daemonRunning, true);
      assert.equal(snapshot.bridgeConnected, true);
      assert.equal(snapshot.bridgeStatus?.attached, true);
      assert.equal(snapshot.bridgeStatus?.protocolVersion, 1);
      assert.equal(snapshot.bridgeStatus?.hostVersion, "2.0.0");

      // 4. Exercise /api/internal/runtimes/deepseek-harness/{bindings,local-turns} on real Go daemon!
      const savedBinding = await service.setSessionSyncMode("dsh-sess-e2e-1", "local_only", {
        title: "Local E2E Scratchpad",
      });
      assert.ok(savedBinding);
      assert.equal(savedBinding.syncMode, "local_only");

      const turnRes = await service.syncLocalTurn({
        agentId: "agt_e2e_1",
        dshSessionId: "dsh-sess-e2e-1",
        role: "user",
        content: "Local-only test message against real loop daemon",
      });
      assert.equal(turnRes.synced, false);
      assert.equal(turnRes.syncMode, "local_only");

      const bindings = await service.listBindings("agt_e2e_1");
      assert.equal(bindings.length, 1);
      assert.equal(bindings[0]!.dshSessionId, "dsh-sess-e2e-1");
      assert.equal(bindings[0]!.syncMode, "local_only");

      await service.disconnect();
    } finally {
      await service.dispose({ stopSpawnedDaemon: true });
      await new Promise<void>((resolve) => mockLoopServer.close(() => resolve()));
      rmSync(workDir, { recursive: true, force: true });
    }
  },
);
