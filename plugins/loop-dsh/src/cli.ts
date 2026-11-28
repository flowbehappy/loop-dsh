#!/usr/bin/env node
import { parseArgs } from "node:util";

import type { HostSyncMode } from "./config.js";
import { LoopDshService } from "./service.js";

function printHelp(): void {
  process.stdout.write(`Usage: loop-dsh <command> [options]

Commands:
  status      Inspect Loop plugin configuration, daemon receipt, and runtime bridge status
  configure   Save loopServerUrl, loopConfigDir, loopBinaryPath, or autoDownloadBinary
  login       Run OAuth 2.1 + PKCE login, bootstrap Machine + Agent, and connect loop daemon
  connect     Ensure local loop daemon is running and attach the DSH runtime bridge
  sync-mode   Set session sync mode ("synced" or "local_only") for a DSH session
  upgrade     Self-upgrade the headless loop binary via "loop upgrade"
  disconnect  Revoke OAuth token and clear the active workspace binding

Options:
  --server-url <url>        Loop Server base URL (e.g. https://loop.pingcap.cn)
  --config-dir <dir>        Override LOOP_CONFIG_DIR (default ~/.loop)
  --state-dir <dir>         Override plugin state directory
  --binary-path <path>      Explicit path to headless loop binary
  --auto-download <bool>    Automatically download headless loop binary (true|false)
  --machine-name <name>     Workspace Machine name during bootstrap
  --agent-name <name>       Agent display name during bootstrap
  --super-agent <bool>      Configure Agent as Super Agent (true|false, default true)
  --session <id>            DSH session ID (for sync-mode)
  --mode <synced|local_only> Session sync mode (for sync-mode)
  --no-browser              Print the OAuth authorization URL instead of opening a browser
  -h, --help                Show this help message
`);
}

function parseOptionalBool(raw: string | undefined): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const normalized = raw.trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "no") {
    return false;
  }
  throw new Error(`Expected boolean (true|false), got "${raw}"`);
}

export async function runCli(argv: string[] = process.argv.slice(2)): Promise<number> {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      "server-url": { type: "string" },
      "config-dir": { type: "string" },
      "state-dir": { type: "string" },
      "binary-path": { type: "string" },
      "auto-download": { type: "string" },
      "machine-name": { type: "string" },
      "agent-name": { type: "string" },
      "super-agent": { type: "string" },
      session: { type: "string" },
      mode: { type: "string" },
      "no-browser": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });

  if (values.help || positionals.length === 0) {
    printHelp();
    return 0;
  }

  const command = positionals[0];
  const service = new LoopDshService({
    stateDir: values["state-dir"],
    loopConfigDir: values["config-dir"],
  });

  try {
    switch (command) {
      case "configure": {
        const updated = service.configure({
          loopServerUrl: values["server-url"],
          loopConfigDir: values["config-dir"],
          loopBinaryPath: values["binary-path"],
          autoDownloadBinary: parseOptionalBool(values["auto-download"]),
        });
        process.stdout.write(JSON.stringify(updated, null, 2) + "\n");
        return 0;
      }

      case "status": {
        const status = await service.getStatus();
        process.stdout.write(JSON.stringify(status, null, 2) + "\n");
        return 0;
      }

      case "login": {
        if (values["binary-path"] || values["auto-download"] !== undefined) {
          service.configure({
            loopBinaryPath: values["binary-path"],
            autoDownloadBinary: parseOptionalBool(values["auto-download"]),
          });
        }
        const result = await service.loginAndBootstrap({
          loopServerUrl: values["server-url"],
          machineName: values["machine-name"],
          agentName: values["agent-name"],
          isSuperAgent: parseOptionalBool(values["super-agent"]),
          openBrowser: !values["no-browser"],
          onAuthorizeUrl: values["no-browser"]
            ? (url) => {
                process.stdout.write(`Open this URL in your browser to authorize Loop:\n${url}\n`);
              }
            : undefined,
        });
        process.stdout.write(
          JSON.stringify(
            {
              binding: result.binding,
              daemonInstanceId: result.daemon.receipt.instanceId,
              daemonBaseUrl: result.daemon.receipt.baseUrl,
              reusedDaemon: result.daemon.reused,
            },
            null,
            2,
          ) + "\n",
        );
        return 0;
      }

      case "connect": {
        const daemon = await service.ensureConnected();
        process.stdout.write(
          JSON.stringify(
            {
              daemonInstanceId: daemon.receipt.instanceId,
              daemonBaseUrl: daemon.receipt.baseUrl,
              reusedDaemon: daemon.reused,
              bridgeConnected: service.runtimeBridge.isConnected,
            },
            null,
            2,
          ) + "\n",
        );
        return 0;
      }

      case "sync-mode": {
        const sessionId = values.session?.trim();
        const mode = values.mode?.trim() as HostSyncMode | undefined;
        if (!sessionId || !mode) {
          throw new Error("sync-mode requires --session <dshSessionId> and --mode <synced|local_only>");
        }
        const binding = await service.setSessionSyncMode(sessionId, mode);
        process.stdout.write(
          JSON.stringify({ sessionId, mode, daemonBinding: binding }, null, 2) + "\n",
        );
        return 0;
      }

      case "upgrade": {
        const upgraded = await service.upgradeDaemon();
        if (upgraded.stdout) {
          process.stdout.write(upgraded.stdout);
        }
        if (upgraded.stderr) {
          process.stderr.write(upgraded.stderr);
        }
        return 0;
      }

      case "disconnect": {
        await service.disconnect();
        process.stdout.write(JSON.stringify({ disconnected: true }, null, 2) + "\n");
        return 0;
      }

      default:
        throw new Error(`Unknown command: ${command}`);
    }
  } finally {
    await service.dispose();
  }
}

const isDirectEntry =
  process.argv[1] &&
  (process.argv[1].endsWith("/cli.js") ||
    process.argv[1].endsWith("\\cli.js") ||
    process.argv[1].endsWith("/loop-dsh"));

if (isDirectEntry) {
  runCli().then(
    (code) => {
      process.exitCode = code;
    },
    (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      process.stderr.write(`Error: ${msg}\n`);
      process.exitCode = 1;
    },
  );
}
