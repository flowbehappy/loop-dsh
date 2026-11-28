import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { hostname } from "node:os";

import {
  type ConfigStore,
  type LoopDaemonArtifact,
  type LoopDshBinding,
  normalizeLoopServerUrl,
} from "./config.js";
import type { DaemonManager, EnsureDaemonResult } from "./daemon-manager.js";

export const OAUTH_BOOTSTRAP_SCOPE = "loop.machine.bootstrap offline_access";

export interface OAuthMachineSummary {
  id: string;
  name: string;
  status: string;
  hostname?: string;
  os?: string;
  daemonVersion?: string;
  runtimes?: string[];
}

export interface OAuthAgentView {
  id: string;
  memberId: string;
  name: string;
  displayName?: string;
  machineId?: string;
  runtime: string;
  sessionMode: string;
  isSuperAgent: boolean;
}

export interface OAuthBootstrapContextResponse {
  serverUrl: string;
  workspaceId: string;
  workspaceName: string;
  workspaceSlug: string;
  userId: string;
  memberId: string;
  machines: OAuthMachineSummary[];
  agents: OAuthAgentView[];
  daemonArtifact?: LoopDaemonArtifact;
}

export interface OAuthBootstrapResponse {
  serverUrl: string;
  workspaceId: string;
  machine: {
    id: string;
    name: string;
    connectToken: string;
  };
  agent: OAuthAgentView;
  daemonArtifact?: LoopDaemonArtifact;
}

export interface LoginAndBootstrapOptions {
  configStore: ConfigStore;
  daemonManager: DaemonManager;
  loopServerUrl?: string;
  machineName?: string;
  existingMachineId?: string;
  agentName?: string;
  existingAgentId?: string;
  isSuperAgent?: boolean;
  workDir?: string;
  callbackTimeoutMs?: number;
  openBrowser?: boolean;
  onAuthorizeUrl?: (authorizeUrl: string) => void | Promise<void>;
  fetchImpl?: typeof fetch;
}

export interface LoginAndBootstrapResult {
  binding: LoopDshBinding;
  daemon: EnsureDaemonResult;
  daemonArtifact?: LoopDaemonArtifact;
}

export function normalizeHostPlatform(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): { os: string; arch: string } {
  const osName =
    platform === "darwin"
      ? "darwin"
      : platform === "win32"
        ? "windows"
        : "linux";
  const archName =
    arch === "arm64"
      ? "arm64"
      : arch === "x64" || arch === "amd64"
        ? "amd64"
        : arch;
  return { os: osName, arch: archName };
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function openUrlInBrowser(url: string): void {
  if (process.platform === "darwin") {
    const child = spawn("open", [url], { detached: true, stdio: "ignore" });
    child.unref();
    return;
  }
  if (process.platform === "win32") {
    const child = spawn("cmd", ["/c", "start", "", url], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return;
  }
  const child = spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
  child.unref();
}

interface CallbackHandle {
  redirectUri: string;
  waitForCode: () => Promise<string>;
  close: () => Promise<void>;
}

async function startLoopbackCallbackServer(
  expectedState: string,
  timeoutMs: number,
): Promise<CallbackHandle> {
  let resolveCode!: (code: string) => void;
  let rejectCode!: (error: Error) => void;
  let settled = false;

  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });

  const server = createServer((req, res) => {
    try {
      const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname !== "/oauth/callback") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not Found");
        return;
      }

      const returnedState = requestUrl.searchParams.get("state") ?? "";
      const errorCode = requestUrl.searchParams.get("error");
      const errorDescription = requestUrl.searchParams.get("error_description");
      const code = requestUrl.searchParams.get("code") ?? "";

      if (returnedState !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>Invalid OAuth state</h1><p>You may close this window.</p>");
        if (!settled) {
          settled = true;
          rejectCode(new Error("OAuth callback state mismatch"));
        }
        return;
      }

      if (errorCode) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>Loop authorization cancelled</h1><p>You may close this window.</p>");
        if (!settled) {
          settled = true;
          rejectCode(
            new Error(
              `OAuth authorization failed (${errorCode})${errorDescription ? `: ${errorDescription}` : ""}`,
            ),
          );
        }
        return;
      }

      if (!code) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h1>Missing authorization code</h1><p>You may close this window.</p>");
        if (!settled) {
          settled = true;
          rejectCode(new Error("OAuth callback missing code parameter"));
        }
        return;
      }

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        "<!doctype html><html><body style=\"font-family:system-ui,sans-serif;padding:2rem\">" +
          "<h2>Loop connected to DeepSeek Harness</h2>" +
          "<p>Finishing local daemon and runtime setup. You can close this window.</p>" +
          "</body></html>",
      );
      if (!settled) {
        settled = true;
        resolveCode(code);
      }
    } catch (err) {
      if (!settled) {
        settled = true;
        rejectCode(err instanceof Error ? err : new Error(String(err)));
      }
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  const redirectUri = `http://127.0.0.1:${address.port}/oauth/callback`;

  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      rejectCode(new Error(`Timed out after ${timeoutMs}ms waiting for OAuth browser callback`));
    }
  }, timeoutMs);
  timer.unref?.();

  const close = async (): Promise<void> => {
    clearTimeout(timer);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return {
    redirectUri,
    waitForCode: async () => {
      try {
        return await codePromise;
      } finally {
        await close();
      }
    },
    close,
  };
}

export async function loginAndBootstrap(
  options: LoginAndBootstrapOptions,
): Promise<LoginAndBootstrapResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const savedConfig = options.configStore.read();
  const rawServerUrl = options.loopServerUrl ?? savedConfig.loopServerUrl;
  if (!rawServerUrl) {
    throw new Error("loopServerUrl is required before starting OAuth login");
  }
  const serverUrl = normalizeLoopServerUrl(rawServerUrl);
  options.configStore.configure({ loopServerUrl: serverUrl });

  const state = randomBytes(24).toString("base64url");
  const { codeVerifier, codeChallenge } = generatePkcePair();
  const callbackTimeoutMs = options.callbackTimeoutMs ?? 180_000;
  const callbackServer = await startLoopbackCallbackServer(state, callbackTimeoutMs);
  const resource = `${serverUrl}/api/v1/auth/oauth/bootstrap`;
  const hostName = hostname() || "dsh-host";

  try {
    // 1. Dynamic OAuth public client registration (RFC 7591 / RFC 8252).
    const registerRes = await fetchImpl(`${serverUrl}/api/v1/auth/oauth/register`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_name: "Loop for DeepSeek Harness",
        redirect_uris: [callbackServer.redirectUri],
        token_endpoint_auth_method: "none",
      }),
    });
    if (!registerRes.ok) {
      const errText = await registerRes.text();
      throw new Error(`OAuth client registration failed (${registerRes.status}): ${errText}`);
    }
    const registeredClient = (await registerRes.json()) as { client_id: string };
    const clientId = registeredClient.client_id;
    if (!clientId) {
      throw new Error("OAuth client registration returned an empty client_id");
    }

    // 2. Build browser authorization URL & launch consent flow.
    const authorizeUrl = new URL(`${serverUrl}/api/v1/auth/oauth/authorize`);
    authorizeUrl.searchParams.set("response_type", "code");
    authorizeUrl.searchParams.set("client_id", clientId);
    authorizeUrl.searchParams.set("redirect_uri", callbackServer.redirectUri);
    authorizeUrl.searchParams.set("code_challenge", codeChallenge);
    authorizeUrl.searchParams.set("code_challenge_method", "S256");
    authorizeUrl.searchParams.set("state", state);
    authorizeUrl.searchParams.set("scope", OAUTH_BOOTSTRAP_SCOPE);
    authorizeUrl.searchParams.set("resource", resource);
    authorizeUrl.searchParams.set("device_label", hostName);
    authorizeUrl.searchParams.set("host_source", "dsh");

    if (options.onAuthorizeUrl) {
      await options.onAuthorizeUrl(authorizeUrl.toString());
    } else if (options.openBrowser !== false) {
      openUrlInBrowser(authorizeUrl.toString());
    }

    // 3. Wait for authorization code from loopback redirect.
    const code = await callbackServer.waitForCode();

    // 4. Exchange authorization code for access + refresh tokens.
    const tokenForm = new URLSearchParams({
      grant_type: "authorization_code",
      code,
      client_id: clientId,
      redirect_uri: callbackServer.redirectUri,
      resource,
      code_verifier: codeVerifier,
    });
    const tokenRes = await fetchImpl(`${serverUrl}/api/v1/auth/oauth/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: tokenForm.toString(),
    });
    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      throw new Error(`OAuth token exchange failed (${tokenRes.status}): ${errText}`);
    }
    const tokenPayload = (await tokenRes.json()) as {
      grant_id?: string;
      workspace_id?: string;
      access_token: string;
      refresh_token?: string;
      scope?: string;
      resource?: string;
    };
    if (!tokenPayload.access_token) {
      throw new Error("OAuth token exchange returned an empty access_token");
    }

    // 5. Inspect bootstrap context (workspace, existing machines/agents, headless daemon artifact).
    const platformInfo = normalizeHostPlatform();
    const ctxUrl = new URL(`${serverUrl}/api/v1/auth/oauth/bootstrap/context`);
    ctxUrl.searchParams.set("os", platformInfo.os);
    ctxUrl.searchParams.set("arch", platformInfo.arch);
    const ctxRes = await fetchImpl(ctxUrl.toString(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        Accept: "application/json",
      },
    });
    if (!ctxRes.ok) {
      const errText = await ctxRes.text();
      throw new Error(`OAuth bootstrap context failed (${ctxRes.status}): ${errText}`);
    }
    const bootCtx = (await ctxRes.json()) as OAuthBootstrapContextResponse;

    const existingMachineId =
      options.existingMachineId ??
      (savedConfig.binding &&
      savedConfig.binding.workspaceId === bootCtx.workspaceId &&
      bootCtx.machines.some((m) => m.id === savedConfig.binding?.machineId)
        ? savedConfig.binding.machineId
        : undefined);

    const existingAgentId =
      options.existingAgentId ??
      (savedConfig.binding &&
      savedConfig.binding.workspaceId === bootCtx.workspaceId &&
      bootCtx.agents.some((a) => a.id === savedConfig.binding?.agentId)
        ? savedConfig.binding.agentId
        : undefined);

    // 6. Provision or reuse workspace Machine (connectToken) + native deepseek-harness Agent.
    const isSuperAgent = options.isSuperAgent ?? savedConfig.binding?.isSuperAgent ?? true;
    const bootRes = await fetchImpl(`${serverUrl}/api/v1/auth/oauth/bootstrap`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokenPayload.access_token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        existingMachineId,
        machineName: options.machineName ?? savedConfig.binding?.machineName ?? hostName,
        hostname: hostName,
        os: platformInfo.os,
        arch: platformInfo.arch,
        existingAgentId,
        agentName: options.agentName ?? savedConfig.binding?.agentName ?? "DSH Assistant",
        isSuperAgent,
        workDir: options.workDir,
      }),
    });
    if (!bootRes.ok) {
      const errText = await bootRes.text();
      throw new Error(`OAuth Machine/Agent bootstrap failed (${bootRes.status}): ${errText}`);
    }
    const bootstrapped = (await bootRes.json()) as OAuthBootstrapResponse;
    const daemonArtifact = bootstrapped.daemonArtifact ?? bootCtx.daemonArtifact;

    const binding: LoopDshBinding = {
      serverUrl: normalizeLoopServerUrl(bootstrapped.serverUrl || serverUrl),
      workspaceId: bootstrapped.workspaceId,
      workspaceName: bootCtx.workspaceName,
      workspaceSlug: bootCtx.workspaceSlug,
      machineId: bootstrapped.machine.id,
      machineName: bootstrapped.machine.name,
      agentId: bootstrapped.agent.id,
      memberId: bootstrapped.agent.memberId,
      agentName: bootstrapped.agent.name,
      displayName: bootstrapped.agent.displayName,
      isSuperAgent: bootstrapped.agent.isSuperAgent,
    };

    options.configStore.update((current) => ({
      ...current,
      loopServerUrl: binding.serverUrl,
      oauth: {
        clientId,
        grantId: tokenPayload.grant_id,
        refreshToken: tokenPayload.refresh_token,
        scope: tokenPayload.scope ?? OAUTH_BOOTSTRAP_SCOPE,
        resource: tokenPayload.resource ?? resource,
      },
      binding,
      daemonArtifact: daemonArtifact ?? current.daemonArtifact,
    }));

    // 7. Ensure local headless/desktop loop daemon is running (auto-downloading binary if needed)
    //    and connect this Machine via one-time connectToken.
    const daemon = await options.daemonManager.connectMachine(
      {
        serverUrl: binding.serverUrl,
        connectToken: bootstrapped.machine.connectToken,
      },
      daemonArtifact,
    );

    return {
      binding,
      daemon,
      daemonArtifact,
    };
  } finally {
    await callbackServer.close();
  }
}
