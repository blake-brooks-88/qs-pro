#!/usr/bin/env node
/* eslint-disable no-console */

const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function runGit(args, cwd) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });

  // In some restricted environments, Node may surface a non-fatal `error`
  // even when the command produced output and exited successfully.
  if (result.status !== 0) {
    const stderr = (result.stderr || "").trim();
    throw new Error(`git ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
  }

  if (result.error && result.status !== 0) {
    throw result.error;
  }

  return String(result.stdout || "").trim();
}

function parseArgs(argv) {
  const args = {
    threshold: 90,
    base: undefined,
    head: "HEAD",
    coverageSummaryPath: "coverage/coverage-summary.json",
    mode: "per-file",
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;

    if (token === "--threshold") {
      const value = argv[++i];
      args.threshold = Number(value);
      continue;
    }
    if (token === "--base") {
      args.base = argv[++i];
      continue;
    }
    if (token === "--head") {
      args.head = argv[++i];
      continue;
    }
    if (token === "--coverage-summary") {
      args.coverageSummaryPath = argv[++i];
      continue;
    }
    if (token === "--mode") {
      args.mode = argv[++i];
      continue;
    }
    if (token === "-h" || token === "--help") {
      return { ...args, help: true };
    }

    throw new Error(`Unknown arg: ${token}`);
  }

  if (!Number.isFinite(args.threshold) || args.threshold < 0 || args.threshold > 100) {
    throw new Error(`Invalid --threshold: ${String(args.threshold)}`);
  }

  if (!["per-file", "overall", "both"].includes(args.mode)) {
    throw new Error(`Invalid --mode: ${args.mode} (expected per-file|overall|both)`);
  }

  return args;
}

function pickDefaultBase(cwd) {
  const candidates = ["origin/main", "main", "origin/master", "master"];
  for (const ref of candidates) {
    try {
      runGit(["rev-parse", "--verify", ref], cwd);
      return ref;
    } catch {
      // ignore
    }
  }
  return undefined;
}

function isCoveredSourceFile(file) {
  if (!file.startsWith("apps/") && !file.startsWith("packages/")) return false;
  if (!file.includes("/src/")) return false;

  const ext = path.extname(file).toLowerCase();
  if (![".ts", ".tsx", ".js", ".jsx"].includes(ext)) return false;
  if (file.endsWith(".d.ts")) return false;

  const normalized = file.replaceAll("\\", "/");
  const excluded =
    normalized.includes("/__tests__/") ||
    normalized.includes("/test/") ||
    normalized.includes("/stubs/") ||
    normalized.endsWith(".test.ts") ||
    normalized.endsWith(".test.tsx") ||
    normalized.endsWith(".stub.ts") ||
    normalized.endsWith(".stub.tsx") ||
    normalized.endsWith(".stub.js") ||
    normalized.endsWith(".stub.jsx") ||
    normalized.endsWith(".spec.ts") ||
    normalized.endsWith(".spec.tsx") ||
    normalized.endsWith(".integration.test.ts") ||
    normalized.endsWith(".integration.test.tsx") ||
    normalized.endsWith(".e2e.test.ts") ||
    normalized.endsWith(".e2e.test.tsx") ||
    normalized.includes("/dist/") ||
    normalized.endsWith("/main.ts") ||
    normalized.endsWith("/main.tsx") ||
    normalized.endsWith("/instrument.ts") ||
    normalized.endsWith(".health.ts") ||
    normalized.endsWith("/health.controller.ts") ||
    normalized.endsWith("/health.module.ts") ||
    normalized.endsWith("/observability.module.ts") ||
    normalized.endsWith("/metrics.module.ts");

  return !excluded;
}

function isTypeOnlyFile(file, repoRoot) {
  const abs = path.resolve(repoRoot, file);
  let content = "";
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    return false;
  }

  // Strip comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, "");
  content = content.replace(/\/\/.*$/gm, "");

  const trimmed = content.replace(/\s+/g, " ").trim();
  if (!trimmed) return false;

  // A file is type-only if every import uses `import type` and every export
  // is a type alias or interface.  Detect runtime code by its absence:
  // no const/let/var, no function/class declarations, no default exports,
  // no non-type imports, no require().
  const hasRuntimeImport = /\bimport\s+(?!type\b)/.test(trimmed);
  const hasRuntimeDecl = /\b(const|let|var|function|class|enum)\s/.test(trimmed);
  const hasDefaultExport = /\bexport\s+default\b/.test(trimmed);
  const hasRequire = /\brequire\s*\(/.test(trimmed);

  return !hasRuntimeImport && !hasRuntimeDecl && !hasDefaultExport && !hasRequire;
}

function isBarrelIndexFile(file, repoRoot) {
  const normalized = file.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  if (!/^index\.(ts|tsx|js|jsx)$/.test(basename)) {
    return false;
  }

  const abs = path.resolve(repoRoot, file);
  let content = "";
  try {
    content = fs.readFileSync(abs, "utf8");
  } catch {
    return false;
  }

  const lines = content.split(/\r?\n/);
  let inBlockComment = false;

  for (const rawLine of lines) {
    let line = rawLine;

    if (inBlockComment) {
      const end = line.indexOf("*/");
      if (end === -1) {
        continue;
      }
      line = line.slice(end + 2);
      inBlockComment = false;
    }

    while (true) {
      const blockStart = line.indexOf("/*");
      if (blockStart === -1) {
        break;
      }
      const blockEnd = line.indexOf("*/", blockStart + 2);
      if (blockEnd === -1) {
        line = line.slice(0, blockStart);
        inBlockComment = true;
        break;
      }
      line = `${line.slice(0, blockStart)}${line.slice(blockEnd + 2)}`;
    }

    const lineComment = line.indexOf("//");
    if (lineComment !== -1) {
      line = line.slice(0, lineComment);
    }

    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    const isReExportLine =
      /^export\s+(type\s+)?\*\s+from\s+["'][^"']+["']\s*;?$/.test(trimmed) ||
      /^export\s+(type\s+)?\*\s+as\s+\w+\s+from\s+["'][^"']+["']\s*;?$/.test(trimmed) ||
      /^export\s+(type\s+)?\{[^}]*\}\s+from\s+["'][^"']+["']\s*;?$/.test(trimmed) ||
      /^export\s+\{\}\s*;?$/.test(trimmed);

    if (!isReExportLine) {
      return false;
    }
  }

  return true;
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    console.log(
      [
        "check-changed-coverage",
        "",
        "Checks that coverage for changed source files meets a threshold.",
        "",
        "Usage:",
        "  node scripts/check-changed-coverage.js --threshold 90",
        "",
        "Options:",
        "  --threshold <0-100>           Minimum line coverage percent (default: 90)",
        "  --base <git-ref>              Base ref for diff (default: origin/main|main|origin/master|master)",
        "  --head <git-ref>              Head ref for diff (default: HEAD)",
        "  --coverage-summary <path>     NYC json-summary file (default: coverage/coverage-summary.json)",
        "  --mode per-file|overall|both  Enforcement mode (default: per-file)",
      ].join("\n"),
    );
    process.exit(0);
  }

  const repoRoot = runGit(["rev-parse", "--show-toplevel"], process.cwd());

  const baseRef =
    args.base ??
    (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : undefined) ??
    pickDefaultBase(repoRoot);
  if (!baseRef) {
    throw new Error("Could not determine base ref (use --base)");
  }

  const diffBase = runGit(["merge-base", baseRef, args.head], repoRoot);
  const changed = runGit(["diff", "--name-only", "--diff-filter=ACMRTUXB", `${diffBase}...${args.head}`], repoRoot)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isCoveredSourceFile);

  const coveredChanged = changed.filter(
    (file) => !isBarrelIndexFile(file, repoRoot) && !isTypeOnlyFile(file, repoRoot),
  );

  if (coveredChanged.length === 0) {
    console.log("No changed covered source files.");
    return;
  }

  const summaryPath = path.resolve(repoRoot, args.coverageSummaryPath);
  if (!fs.existsSync(summaryPath)) {
    throw new Error(`Coverage summary not found at ${summaryPath}. Run coverage first.`);
  }

  const summary = JSON.parse(fs.readFileSync(summaryPath, "utf8"));

  const threshold = args.threshold;
  const missing = [];
  const failing = [];
  let overallTotal = 0;
  let overallCovered = 0;

  for (const rel of coveredChanged) {
    const abs = path.resolve(repoRoot, rel);
    const entry = summary[abs];
    if (!entry || !entry.lines) {
      missing.push(rel);
      continue;
    }

    const pct = Number(entry.lines.pct);
    const total = Number(entry.lines.total);
    const covered = Number(entry.lines.covered);

    if (Number.isFinite(total) && Number.isFinite(covered)) {
      overallTotal += total;
      overallCovered += covered;
    }

    if (!Number.isFinite(pct) || pct < threshold) {
      failing.push({ file: rel, pct });
    }
  }

  const overallPct = overallTotal > 0 ? (overallCovered / overallTotal) * 100 : 0;

  const shouldEnforcePerFile = args.mode === "per-file" || args.mode === "both";
  const shouldEnforceOverall = args.mode === "overall" || args.mode === "both";

  let ok = true;

  if (missing.length) {
    ok = false;
    console.error("Missing coverage entries for changed files:");
    for (const file of missing) console.error(`- ${file}`);
    console.error("");
  }

  if (shouldEnforcePerFile && failing.length) {
    ok = false;
    console.error(`Changed files below ${threshold}% line coverage:`);
    failing
      .sort((a, b) => a.pct - b.pct)
      .forEach(({ file, pct }) => console.error(`- ${file}: ${Number.isFinite(pct) ? pct.toFixed(2) : "N/A"}%`));
    console.error("");
  }

  if (shouldEnforceOverall) {
    if (overallPct < threshold) {
      ok = false;
      console.error(
        `Overall changed-file coverage below ${threshold}%: ${overallPct.toFixed(2)}% (${overallCovered}/${overallTotal} lines)`,
      );
      console.error("");
    } else {
      console.log(
        `Overall changed-file coverage: ${overallPct.toFixed(2)}% (${overallCovered}/${overallTotal} lines)`,
      );
    }
  }

  if (ok) {
    if (shouldEnforcePerFile) {
      console.log(`All changed files meet >= ${threshold}% line coverage.`);
    }
    return;
  }

  process.exit(1);
}

main();
