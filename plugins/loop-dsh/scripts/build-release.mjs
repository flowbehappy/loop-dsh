import { cp, lstat, mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const destination = process.argv[2];
if (!destination || !isAbsolute(destination)) {
  throw new Error("Usage: node scripts/build-release.mjs /absolute/output/dir");
}
try {
  await lstat(destination);
  throw new Error(`Destination already exists: ${destination}`);
} catch (err) {
  if (err && typeof err === "object" && "code" in err && err.code !== "ENOENT") {
    throw err;
  }
}

const scriptDir = dirname(fileURLToPath(import.meta.url));
const pluginRoot = resolve(scriptDir, "..");
const repoRoot = resolve(pluginRoot, "../..");

execFileSync("npm", ["run", "build"], { cwd: pluginRoot, stdio: "inherit" });

await mkdir(dirname(destination), { recursive: true });
const stage = await mkdtemp(join(dirname(destination), ".loop-dsh-stage-"));
try {
  await cp(join(pluginRoot, "dist"), join(stage, "dist"), { recursive: true });
  await cp(join(pluginRoot, "cordis.patch.yml"), join(stage, "cordis.patch.yml"));
  await cp(join(pluginRoot, "README.md"), join(stage, "README.md"));
  await cp(join(repoRoot, "LICENSE"), join(stage, "LICENSE"));
  await mkdir(join(stage, "skills", "loop-dsh"), { recursive: true });
  await cp(
    join(repoRoot, "skills", "loop-dsh", "SKILL.md"),
    join(stage, "skills", "loop-dsh", "SKILL.md"),
  );

  const pkg = JSON.parse(await readFile(join(pluginRoot, "package.json"), "utf8"));
  delete pkg.devDependencies;
  delete pkg.scripts;
  pkg.files = ["dist", "cordis.patch.yml", "skills/loop-dsh/SKILL.md", "README.md", "LICENSE", "artifact.sha256"];
  await writeFile(join(stage, "package.json"), JSON.stringify(pkg, null, 2) + "\n", "utf8");

  const hashes = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile()) {
        const digest = createHash("sha256").update(await readFile(fullPath)).digest("hex");
        hashes.push(`${digest}  ${relative(stage, fullPath).replaceAll("\\", "/")}`);
      } else {
        throw new Error(`Release archive cannot contain symbolic links: ${fullPath}`);
      }
    }
  }
  await walk(stage);
  hashes.sort();
  await writeFile(join(stage, "artifact.sha256"), hashes.join("\n") + "\n", "utf8");
  await cp(stage, destination, { recursive: true });
} finally {
  await rm(stage, { recursive: true, force: true });
}
