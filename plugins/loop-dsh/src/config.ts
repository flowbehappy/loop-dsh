import { randomUUID } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type HostSyncMode = "synced" | "local_only";

export interface LoopDaemonArtifact {
  version: string;
  archiveUrl: string;
  sha256: string;
}

export interface LoopOAuthState {
  clientId: string;
  grantId?: string;
  refreshToken?: string;
  scope?: string;
  resource?: string;
}

export interface LoopDshBinding {
  serverUrl: string;
  workspaceId: string;
  workspaceName?: string;
  workspaceSlug?: string;
  machineId: string;
  machineName: string;
  agentId: string;
  memberId?: string;
  agentName: string;
  displayName?: string;
  isSuperAgent: boolean;
}

export interface LoopDshConfig {
  schemaVersion: 2;
  loopServerUrl?: string;
  loopConfigDir?: string;
  loopBinaryPath?: string;
  autoDownloadBinary: boolean;
  oauth?: LoopOAuthState;
  binding?: LoopDshBinding;
  daemonArtifact?: LoopDaemonArtifact;
  sessionSyncModes: Record<string, HostSyncMode>;
}

export interface ConfigureLoopDshPatch {
  loopServerUrl?: string;
  loopConfigDir?: string;
  loopBinaryPath?: string;
  autoDownloadBinary?: boolean;
}

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
  return (
    normalized === "localhost" ||
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized.startsWith("127.")
  );
}

/**
 * Validates and normalizes a Loop Server base URL.
 * Allows https:// origins and loopback http:// origins for local development/testing.
 */
export function normalizeLoopServerUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("loopServerUrl must not be empty");
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error(`Invalid loopServerUrl: ${raw}`);
  }
  if (parsed.username || parsed.password) {
    throw new Error("loopServerUrl must not embed credentials");
  }
  if (parsed.search || parsed.hash) {
    throw new Error("loopServerUrl must not include query parameters or fragments");
  }
  if (parsed.protocol === "https:") {
    // Valid production URL.
  } else if (parsed.protocol === "http:") {
    if (!isLoopbackHostname(parsed.hostname)) {
      throw new Error("Insecure http:// loopServerUrl is allowed only for loopback hosts (127.0.0.1, localhost, [::1])");
    }
  } else {
    throw new Error(`Unsupported loopServerUrl protocol: ${parsed.protocol}`);
  }
  const cleanPath = parsed.pathname.replace(/\/+$/, "");
  return `${parsed.origin}${cleanPath}`;
}

export function normalizeSyncMode(mode: string | undefined): HostSyncMode {
  const trimmed = (mode ?? "").trim().toLowerCase();
  if (trimmed === "" || trimmed === "synced") {
    return "synced";
  }
  if (trimmed === "local_only") {
    return "local_only";
  }
  throw new Error(`Unsupported syncMode "${mode}"; expected "synced" or "local_only"`);
}

export function defaultLoopConfigDir(override?: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (override ?? "").trim() || (env.LOOP_CONFIG_DIR ?? "").trim();
  if (explicit) {
    return resolve(explicit);
  }
  return join(homedir(), ".loop");
}

export function defaultPluginStateDir(override?: string, env: NodeJS.ProcessEnv = process.env): string {
  const explicit = (override ?? "").trim() || (env.LOOP_DSH_STATE_DIR ?? "").trim();
  if (explicit) {
    return resolve(explicit);
  }
  return join(defaultLoopConfigDir(undefined, env), "plugins", "loop-dsh");
}

function ensurePrivateDir(dirPath: string): void {
  mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    try {
      chmodSync(dirPath, 0o700);
    } catch {
      // Best-effort on filesystems without POSIX chmod semantics.
    }
  }
}

export class ConfigStore {
  readonly stateDir: string;
  readonly configPath: string;

  constructor(stateDir?: string, env: NodeJS.ProcessEnv = process.env) {
    this.stateDir = defaultPluginStateDir(stateDir, env);
    this.configPath = join(this.stateDir, "config.json");
  }

  read(): LoopDshConfig {
    if (!existsSync(this.configPath)) {
      return {
        schemaVersion: 2,
        autoDownloadBinary: true,
        sessionSyncModes: {},
      };
    }
    const raw = JSON.parse(readFileSync(this.configPath, "utf8")) as Partial<LoopDshConfig>;
    const sessionSyncModes: Record<string, HostSyncMode> = {};
    if (raw.sessionSyncModes && typeof raw.sessionSyncModes === "object") {
      for (const [sessionId, mode] of Object.entries(raw.sessionSyncModes)) {
        if (mode === "synced" || mode === "local_only") {
          sessionSyncModes[sessionId] = mode;
        }
      }
    }
    return {
      schemaVersion: 2,
      loopServerUrl: raw.loopServerUrl ? normalizeLoopServerUrl(raw.loopServerUrl) : undefined,
      loopConfigDir: raw.loopConfigDir?.trim() || undefined,
      loopBinaryPath: raw.loopBinaryPath?.trim() || undefined,
      autoDownloadBinary: raw.autoDownloadBinary !== false,
      oauth: raw.oauth,
      binding: raw.binding,
      daemonArtifact: raw.daemonArtifact,
      sessionSyncModes,
    };
  }

  write(config: LoopDshConfig): LoopDshConfig {
    ensurePrivateDir(dirname(this.configPath));
    const normalized: LoopDshConfig = {
      schemaVersion: 2,
      loopServerUrl: config.loopServerUrl ? normalizeLoopServerUrl(config.loopServerUrl) : undefined,
      loopConfigDir: config.loopConfigDir?.trim() || undefined,
      loopBinaryPath: config.loopBinaryPath?.trim() || undefined,
      autoDownloadBinary: config.autoDownloadBinary !== false,
      oauth: config.oauth,
      binding: config.binding,
      daemonArtifact: config.daemonArtifact,
      sessionSyncModes: { ...(config.sessionSyncModes ?? {}) },
    };
    const tempPath = `${this.configPath}.${randomUUID()}.tmp`;
    writeFileSync(tempPath, JSON.stringify(normalized, null, 2) + "\n", {
      encoding: "utf8",
      mode: 0o600,
    });
    if (process.platform !== "win32") {
      try {
        chmodSync(tempPath, 0o600);
      } catch {
        // Ignore non-POSIX FS chmod errors.
      }
    }
    renameSync(tempPath, this.configPath);
    return normalized;
  }

  update(mutator: (current: LoopDshConfig) => LoopDshConfig): LoopDshConfig {
    const current = this.read();
    return this.write(mutator(current));
  }

  configure(patch: ConfigureLoopDshPatch): LoopDshConfig {
    return this.update((current) => {
      const next: LoopDshConfig = { ...current };
      if (patch.loopServerUrl !== undefined) {
        const trimmed = patch.loopServerUrl.trim();
        next.loopServerUrl = trimmed === "" ? undefined : normalizeLoopServerUrl(trimmed);
      }
      if (patch.loopConfigDir !== undefined) {
        const trimmed = patch.loopConfigDir.trim();
        if (trimmed !== "" && !isAbsolute(trimmed)) {
          throw new Error("loopConfigDir must be an absolute path when set");
        }
        next.loopConfigDir = trimmed === "" ? undefined : trimmed;
      }
      if (patch.loopBinaryPath !== undefined) {
        const trimmed = patch.loopBinaryPath.trim();
        if (trimmed !== "" && !isAbsolute(trimmed)) {
          throw new Error("loopBinaryPath must be an absolute path when set");
        }
        next.loopBinaryPath = trimmed === "" ? undefined : trimmed;
      }
      if (patch.autoDownloadBinary !== undefined) {
        next.autoDownloadBinary = Boolean(patch.autoDownloadBinary);
      }
      return next;
    });
  }
}
