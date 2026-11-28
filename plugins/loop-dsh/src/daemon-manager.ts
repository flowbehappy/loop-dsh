import { type ChildProcess, execFile, spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  accessSync,
  chmodSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { delimiter, dirname, join, posix, resolve } from "node:path";
import { promisify } from "node:util";
import { gunzipSync } from "node:zlib";

import {
  type ConfigStore,
  defaultLoopConfigDir,
  type LoopDaemonArtifact,
  type LoopDshConfig,
} from "./config.js";

const execFileAsync = promisify(execFile);

const STRIPPED_ENV_PREFIXES = [
  "LOOP_EXEC_",
  "LOOP_AGENT_",
  "LOOP_MCP_",
  "LOOP_HARNESS_",
];

export interface DaemonReceipt {
  schemaVersion: number;
  desktopApiVersion: number;
  instanceId: string;
  pid: number;
  baseUrl: string;
  controlToken: string;
}

export interface HostRuntimeBridgeStatus {
  attached: boolean;
  protocolVersion?: number;
  hostVersion?: string;
  dshHome?: string;
  capabilities?: string[];
  activeStreams: number;
  attachedAt?: string;
}

export interface EnsureDaemonResult {
  receipt: DaemonReceipt;
  status: HostRuntimeBridgeStatus;
  reused: boolean;
  binaryPath?: string;
  spawnedPid?: number;
}

export function loopBinaryFilename(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "loop.exe" : "loop";
}

/**
 * Strips agent-session environment variables (such as LOOP_EXEC_BASE_URL and
 * LOOP_EXEC_TOKEN_FILE) so spawned `loop` CLI invocations execute as host-level
 * commands instead of inside an ExecRuntimeSession sandbox.
 */
export function sanitizeDaemonEnv(
  baseEnv: NodeJS.ProcessEnv = process.env,
  loopConfigDir?: string,
): NodeJS.ProcessEnv {
  const clean: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(baseEnv)) {
    if (value === undefined) {
      continue;
    }
    const upper = key.toUpperCase();
    if (STRIPPED_ENV_PREFIXES.some((prefix) => upper.startsWith(prefix))) {
      continue;
    }
    clean[key] = value;
  }
  if (loopConfigDir && loopConfigDir.trim() !== "") {
    clean.LOOP_CONFIG_DIR = resolve(loopConfigDir.trim());
  }
  return clean;
}

export function resolveReceiptPath(configDir: string): string {
  return join(resolve(configDir), "run", "daemon.json");
}

export function readDaemonReceipt(configDir: string): DaemonReceipt | null {
  const receiptPath = resolveReceiptPath(configDir);
  if (!existsSync(receiptPath)) {
    return null;
  }
  try {
    const raw = JSON.parse(readFileSync(receiptPath, "utf8")) as Record<string, unknown>;
    const baseUrlRaw =
      typeof raw.baseURL === "string"
        ? raw.baseURL
        : typeof raw.baseUrl === "string"
          ? raw.baseUrl
          : "";
    const controlToken = typeof raw.controlToken === "string" ? raw.controlToken.trim() : "";
    const instanceId = typeof raw.instanceId === "string" ? raw.instanceId.trim() : "";
    const pid = typeof raw.pid === "number" ? raw.pid : 0;
    const schemaVersion = typeof raw.schemaVersion === "number" ? raw.schemaVersion : 1;
    const desktopApiVersion = typeof raw.desktopApiVersion === "number" ? raw.desktopApiVersion : 2;
    if (!baseUrlRaw || !controlToken || !instanceId || pid <= 0) {
      return null;
    }
    const parsedUrl = new URL(baseUrlRaw);
    if (parsedUrl.protocol !== "http:") {
      return null;
    }
    return {
      schemaVersion,
      desktopApiVersion,
      instanceId,
      pid,
      baseUrl: parsedUrl.origin,
      controlToken,
    };
  } catch {
    return null;
  }
}

export async function probeDaemonStatus(
  receipt: DaemonReceipt,
  fetchImpl: typeof fetch = fetch,
): Promise<HostRuntimeBridgeStatus | null> {
  try {
    const response = await fetchImpl(
      `${receipt.baseUrl}/api/internal/runtimes/deepseek-harness/status`,
      {
        method: "GET",
        headers: {
          "X-Loop-Control-Token": receipt.controlToken,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!response.ok) {
      return null;
    }
    return (await response.json()) as HostRuntimeBridgeStatus;
  } catch {
    return null;
  }
}

function parseExpectedSha256(raw: string): string {
  const token = raw.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
  if (!/^[a-f0-9]{64}$/.test(token)) {
    throw new Error(`Invalid SHA-256 checksum metadata: "${raw}"`);
  }
  return token;
}

function parseTarOctal(field: Buffer): number {
  const text = field.toString("ascii").replace(/\0.*$/, "").trim();
  if (text === "") {
    return 0;
  }
  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`Invalid tar header octal value: "${text}"`);
  }
  return value;
}

/**
 * Extracts `loop` (or `loop.exe`) from a `.tar.gz` archive in pure Node.js without
 * shelling out to system `tar`, preventing path traversal and symlink attacks.
 */
export function extractLoopBinaryFromTarGz(
  archiveBytes: Buffer,
  expectedBinaryName: string = loopBinaryFilename(),
): Buffer {
  const tarBytes = gunzipSync(archiveBytes);
  let offset = 0;
  let pendingLongName: string | null = null;
  let pendingPaxPath: string | null = null;

  while (offset + 512 <= tarBytes.length) {
    const header = tarBytes.subarray(offset, offset + 512);
    offset += 512;

    if (header.every((byte) => byte === 0)) {
      break;
    }

    const rawName = header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "");
    const prefix = header.subarray(345, 500).toString("utf8").replace(/\0.*$/, "");
    const size = parseTarOctal(header.subarray(124, 136));
    const typeFlag = header[156] === 0 ? "0" : String.fromCharCode(header[156]);

    const dataStart = offset;
    const dataEnd = dataStart + size;
    if (dataEnd > tarBytes.length) {
      throw new Error("Truncated tar archive while extracting headless loop binary");
    }
    const payload = tarBytes.subarray(dataStart, dataEnd);
    offset += Math.ceil(size / 512) * 512;

    if (typeFlag === "L") {
      pendingLongName = payload.toString("utf8").replace(/\0.*$/, "");
      continue;
    }
    if (typeFlag === "x") {
      const paxText = payload.toString("utf8");
      for (const line of paxText.split("\n")) {
        const spaceIdx = line.indexOf(" ");
        if (spaceIdx > 0) {
          const kv = line.slice(spaceIdx + 1);
          if (kv.startsWith("path=")) {
            pendingPaxPath = kv.slice("path=".length);
          }
        }
      }
      continue;
    }
    if (typeFlag === "g") {
      continue;
    }

    const entryPath = (
      pendingPaxPath ??
      pendingLongName ??
      (prefix ? `${prefix}/${rawName}` : rawName)
    ).replaceAll("\\", "/");
    pendingLongName = null;
    pendingPaxPath = null;

    const cleanName = posix.normalize(entryPath).replace(/^(\.\/+)+/, "");
    if (cleanName.startsWith("../") || cleanName === "..") {
      throw new Error(`Unsafe relative path in daemon archive: ${entryPath}`);
    }
    const baseName = posix.basename(cleanName);
    if (baseName !== expectedBinaryName) {
      continue;
    }
    if (typeFlag !== "0") {
      throw new Error(`Daemon binary entry "${entryPath}" must be a regular file (got type "${typeFlag}")`);
    }
    return Buffer.from(payload);
  }

  throw new Error(`Archive did not contain expected binary "${expectedBinaryName}"`);
}

function isExecutableFile(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }
  try {
    accessSync(
      filePath,
      process.platform === "win32" ? fsConstants.R_OK : fsConstants.X_OK,
    );
    return true;
  } catch {
    return false;
  }
}

export function findLoopBinaryOnPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string | null {
  const binName = loopBinaryFilename(platform);
  const pathVar = env.PATH ?? env.Path ?? "";
  for (const segment of pathVar.split(delimiter)) {
    const trimmed = segment.trim();
    if (!trimmed) {
      continue;
    }
    const candidate = join(trimmed, binName);
    if (isExecutableFile(candidate)) {
      return candidate;
    }
  }
  return null;
}

export async function downloadAndInstallHeadlessBinary(
  artifact: LoopDaemonArtifact,
  configDir: string,
  options: {
    fetchImpl?: typeof fetch;
    platform?: NodeJS.Platform;
  } = {},
): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const platform = options.platform ?? process.platform;
  const expectedSha256 = parseExpectedSha256(artifact.sha256);
  const binDir = join(resolve(configDir), "bin");
  mkdirSync(binDir, { recursive: true, mode: 0o700 });

  const response = await fetchImpl(artifact.archiveUrl, {
    method: "GET",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to download headless loop archive (${response.status}) from ${artifact.archiveUrl}`);
  }
  const archiveBytes = Buffer.from(await response.arrayBuffer());
  const actualSha256 = createHash("sha256").update(archiveBytes).digest("hex").toLowerCase();
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Headless loop binary SHA-256 mismatch: expected ${expectedSha256}, got ${actualSha256}`,
    );
  }

  const binaryName = loopBinaryFilename(platform);
  const binaryBytes = extractLoopBinaryFromTarGz(archiveBytes, binaryName);
  const targetPath = join(binDir, binaryName);
  const tempPath = join(binDir, `.${binaryName}.${randomUUID()}.tmp`);
  try {
    writeFileSync(tempPath, binaryBytes, { mode: 0o755 });
    if (platform !== "win32") {
      chmodSync(tempPath, 0o755);
    }
    renameSync(tempPath, targetPath);
  } catch (err) {
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath);
      } catch {
        // Ignore cleanup failure.
      }
    }
    throw err;
  }
  return targetPath;
}

export interface DaemonManagerOptions {
  configStore: ConfigStore;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  startupTimeoutMs?: number;
}

export class DaemonManager {
  private readonly configStore: ConfigStore;
  private readonly env: NodeJS.ProcessEnv;
  private readonly fetchImpl: typeof fetch;
  private readonly startupTimeoutMs: number;
  private spawnedProcess: ChildProcess | null = null;

  constructor(options: DaemonManagerOptions) {
    this.configStore = options.configStore;
    this.env = options.env ?? process.env;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.startupTimeoutMs = options.startupTimeoutMs ?? 15_000;
  }

  resolveConfigDir(config: LoopDshConfig = this.configStore.read()): string {
    return defaultLoopConfigDir(config.loopConfigDir, this.env);
  }

  async inspectRunningDaemon(
    config: LoopDshConfig = this.configStore.read(),
  ): Promise<{ receipt: DaemonReceipt; status: HostRuntimeBridgeStatus } | null> {
    const configDir = this.resolveConfigDir(config);
    const receipt = readDaemonReceipt(configDir);
    if (!receipt) {
      return null;
    }
    const status = await probeDaemonStatus(receipt, this.fetchImpl);
    if (!status) {
      return null;
    }
    return { receipt, status };
  }

  async ensureBinary(
    config: LoopDshConfig = this.configStore.read(),
    artifactHint?: LoopDaemonArtifact,
  ): Promise<string> {
    if (config.loopBinaryPath) {
      if (!isExecutableFile(config.loopBinaryPath)) {
        throw new Error(`Configured loopBinaryPath is missing or not executable: ${config.loopBinaryPath}`);
      }
      return config.loopBinaryPath;
    }

    const configDir = this.resolveConfigDir(config);
    const managedCandidate = join(configDir, "bin", loopBinaryFilename());
    if (isExecutableFile(managedCandidate)) {
      return managedCandidate;
    }

    const cleanEnv = sanitizeDaemonEnv(this.env, configDir);
    const pathCandidate = findLoopBinaryOnPath(cleanEnv);
    if (pathCandidate) {
      return pathCandidate;
    }

    const artifact = artifactHint ?? config.daemonArtifact;
    if (config.autoDownloadBinary !== false && artifact) {
      return downloadAndInstallHeadlessBinary(artifact, configDir, {
        fetchImpl: this.fetchImpl,
      });
    }

    throw new Error(
      `Unable to locate headless loop binary in ${dirname(managedCandidate)} or PATH` +
        (config.autoDownloadBinary === false ? " (autoDownloadBinary is disabled)" : ""),
    );
  }

  async ensureDaemonRunning(artifactHint?: LoopDaemonArtifact): Promise<EnsureDaemonResult> {
    const config = this.configStore.read();
    const existing = await this.inspectRunningDaemon(config);
    if (existing) {
      return {
        receipt: existing.receipt,
        status: existing.status,
        reused: true,
      };
    }

    const binaryPath = await this.ensureBinary(config, artifactHint);
    const configDir = this.resolveConfigDir(config);
    mkdirSync(configDir, { recursive: true, mode: 0o700 });
    const childEnv = sanitizeDaemonEnv(this.env, configDir);

    const child = spawn(binaryPath, ["daemon"], {
      env: childEnv,
      stdio: "ignore",
      detached: true,
      windowsHide: true,
    });
    child.unref();
    this.spawnedProcess = child;

    const deadline = Date.now() + this.startupTimeoutMs;
    while (Date.now() < deadline) {
      const ready = await this.inspectRunningDaemon(config);
      if (ready) {
        return {
          receipt: ready.receipt,
          status: ready.status,
          reused: false,
          binaryPath,
          spawnedPid: child.pid,
        };
      }
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 150));
    }

    throw new Error(
      `Timed out after ${this.startupTimeoutMs}ms waiting for loop daemon receipt at ${resolveReceiptPath(configDir)}`,
    );
  }

  async connectMachine(
    params: { serverUrl: string; connectToken: string },
    artifactHint?: LoopDaemonArtifact,
  ): Promise<EnsureDaemonResult> {
    const daemonState = await this.ensureDaemonRunning(artifactHint);
    const config = this.configStore.read();
    const binaryPath = daemonState.binaryPath ?? (await this.ensureBinary(config, artifactHint));
    const configDir = this.resolveConfigDir(config);
    const childEnv = sanitizeDaemonEnv(this.env, configDir);

    await execFileAsync(
      binaryPath,
      ["connect", "--server-url", params.serverUrl, "--token", params.connectToken],
      {
        env: childEnv,
        timeout: 30_000,
        windowsHide: true,
      },
    );
    return daemonState;
  }

  async upgradeDaemon(): Promise<{ ok: true; stdout: string; stderr: string }> {
    const config = this.configStore.read();
    const binaryPath = await this.ensureBinary(config);
    const configDir = this.resolveConfigDir(config);
    const childEnv = sanitizeDaemonEnv(this.env, configDir);
    const { stdout, stderr } = await execFileAsync(binaryPath, ["upgrade"], {
      env: childEnv,
      timeout: 120_000,
      windowsHide: true,
    });
    return { ok: true, stdout, stderr };
  }

  async stopOwnedDaemon(timeoutMs = 5_000): Promise<void> {
    const child = this.spawnedProcess;
    this.spawnedProcess = null;
    if (!child || !child.pid) {
      return;
    }
    try {
      process.kill(child.pid, "SIGTERM");
    } catch {
      return;
    }
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      try {
        process.kill(child.pid, 0);
      } catch {
        return;
      }
      await new Promise((resolveTimer) => setTimeout(resolveTimer, 100));
    }
    try {
      process.kill(child.pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}
