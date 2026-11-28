import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  ConfigStore,
  downloadAndInstallHeadlessBinary,
  extractLoopBinaryFromTarGz,
  loopBinaryFilename,
  normalizeLoopServerUrl,
  sanitizeDaemonEnv,
} from "../src/index.js";
import { buildTarGz } from "./helpers/tar.js";

test("normalizeLoopServerUrl validates https and loopback http URLs", () => {
  assert.equal(normalizeLoopServerUrl("https://loop.pingcap.cn/"), "https://loop.pingcap.cn");
  assert.equal(normalizeLoopServerUrl("http://127.0.0.1:8080/"), "http://127.0.0.1:8080");
  assert.equal(normalizeLoopServerUrl("http://localhost:3000"), "http://localhost:3000");

  assert.throws(() => normalizeLoopServerUrl(""), /must not be empty/);
  assert.throws(() => normalizeLoopServerUrl("http://example.com"), /loopback/);
  assert.throws(() => normalizeLoopServerUrl("https://user:pass@loop.pingcap.cn"), /credentials/);
  assert.throws(() => normalizeLoopServerUrl("https://loop.pingcap.cn?foo=1"), /query/);
});

test("ConfigStore persists private configuration and session sync modes", () => {
  const workDir = mkdtempSync(join(tmpdir(), "loop-dsh-cfg-"));
  try {
    const store = new ConfigStore(join(workDir, "state"));
    const initial = store.read();
    assert.equal(initial.autoDownloadBinary, true);
    assert.deepEqual(initial.sessionSyncModes, {});

    const updated = store.configure({
      loopServerUrl: "https://loop.pingcap.cn/",
      loopConfigDir: join(workDir, "dot-loop"),
      autoDownloadBinary: false,
    });
    assert.equal(updated.loopServerUrl, "https://loop.pingcap.cn");
    assert.equal(updated.autoDownloadBinary, false);

    if (process.platform !== "win32") {
      const mode = statSync(store.configPath).mode & 0o777;
      assert.equal(mode, 0o600);
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test("sanitizeDaemonEnv strips agent runtime session variables", () => {
  const sanitized = sanitizeDaemonEnv(
    {
      PATH: "/usr/bin:/bin",
      HOME: "/Users/alice",
      LOOP_EXEC_BASE_URL: "http://127.0.0.1:43123",
      LOOP_EXEC_TOKEN_FILE: "/private/tmp/token",
      LOOP_AGENT_ID: "agt_123",
      LOOP_MCP_URL: "http://127.0.0.1:43123/mcp",
      LOOP_HARNESS_SOCKET: "/tmp/sock",
    },
    "/tmp/custom-loop-dir",
  );
  assert.equal(sanitized.PATH, "/usr/bin:/bin");
  assert.equal(sanitized.HOME, "/Users/alice");
  assert.equal(sanitized.LOOP_CONFIG_DIR, "/tmp/custom-loop-dir");
  assert.equal(sanitized.LOOP_EXEC_BASE_URL, undefined);
  assert.equal(sanitized.LOOP_EXEC_TOKEN_FILE, undefined);
  assert.equal(sanitized.LOOP_AGENT_ID, undefined);
  assert.equal(sanitized.LOOP_MCP_URL, undefined);
  assert.equal(sanitized.LOOP_HARNESS_SOCKET, undefined);
});

test("downloadAndInstallHeadlessBinary verifies SHA-256 and extracts loop binary atomically", async () => {
  const workDir = mkdtempSync(join(tmpdir(), "loop-dsh-dl-"));
  const binName = loopBinaryFilename();
  const fakeBinPayload = Buffer.from("#!/bin/sh\necho loop-headless-2.0.0\n", "utf8");
  const archive = buildTarGz([
    { name: `loop_2.0.0/${binName}`, content: fakeBinPayload, mode: 0o755 },
  ]);
  const sha256 = createHash("sha256").update(archive).digest("hex");

  const server = createServer((req, res) => {
    if (req.url === "/artifacts/loop.tar.gz") {
      res.writeHead(200, { "Content-Type": "application/gzip" });
      res.end(archive);
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  const archiveUrl = `http://127.0.0.1:${port}/artifacts/loop.tar.gz`;

  try {
    // 1. Rejects mismatched SHA-256 checksum.
    await assert.rejects(
      () =>
        downloadAndInstallHeadlessBinary(
          {
            version: "v2.0.0",
            archiveUrl,
            sha256: "0".repeat(64),
          },
          workDir,
        ),
      /SHA-256 mismatch/,
    );
    assert.equal(existsSync(join(workDir, "bin", binName)), false);

    // 2. Installs cleanly when SHA-256 matches.
    const installedPath = await downloadAndInstallHeadlessBinary(
      {
        version: "v2.0.0",
        archiveUrl,
        sha256,
      },
      workDir,
    );
    assert.equal(installedPath, join(workDir, "bin", binName));
    assert.deepEqual(readFileSync(installedPath), fakeBinPayload);

    // 3. Rejects symlink entries inside archives.
    const symlinkArchive = buildTarGz([
      { name: binName, typeFlag: "2", linkName: "/etc/passwd" },
    ]);
    assert.throws(
      () => extractLoopBinaryFromTarGz(symlinkArchive, binName),
      /regular file/,
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(workDir, { recursive: true, force: true });
  }
});
