/**
 * Alice Agent Server — standalone backend for local AI agent.
 * Provides HTTP API for shell execution, filesystem ops, code execution, etc.
 * Runs alongside the frontend dev server.
 *
 * Usage:
 *   npx tsx agent-server.ts
 *   # or:
 *   node --import tsx agent-server.ts
 */

import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { execSync, exec, ChildProcess } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import * as dns from "node:dns/promises";

const PORT = Number(process.env.ALICE_AGENT_PORT) || 3020;
const ALLOWED_ORIGINS = process.env.ALICE_ORIGINS || "http://localhost:3000,http://localhost:5173,http://localhost:8080";

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function runShellCmd(command: string, timeout = 30000, cwd?: string): ExecResult {
  try {
    const output = execSync(command, {
      encoding: "utf-8",
      timeout,
      cwd,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { stdout: output, stderr: "", exitCode: 0 };
  } catch (e: any) {
    return {
      stdout: e.stdout?.toString() || "",
      stderr: e.stderr?.toString() || e.message || String(e),
      exitCode: e.status ?? 1,
    };
  }
}

// Running processes (for process management)
const runningProcesses = new Map<string, ChildProcess>();

// ===== Routes =====

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const origin = req.headers.origin || "";
  const corsOrigin = ALLOWED_ORIGINS.split(",").find(o => origin.startsWith(o.trim())) || origin;

  res.setHeader("Access-Control-Allow-Origin", corsOrigin || "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse URL
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);

  // Read body for POST
  const body = await readBody(req);

  try {
    if (parts[0] === "api") {
      const route = parts.slice(1).join("/");
      await handleRoute(route, req.method || "GET", body, url, res);
    } else {
      // Health check
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "ok", agent: "alice", pid: process.pid }));
    }
  } catch (e: any) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: e.message }));
  }
}

async function handleRoute(route: string, method: string, body: any, url: URL, res: ServerResponse) {
  let result: any;

  switch (route) {
    // ===== Shell =====
    case "shell/run":
      result = runShellCmd(body.command, body.timeout, body.cwd);
      break;

    case "shell/exec":
      result = runShellCmd(body.command, body.timeout, body.cwd);
      break;

    case "shell/spawn": {
      const id = `proc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const proc = exec(body.command, { cwd: body.cwd, encoding: "utf-8", maxBuffer: 10 * 1024 * 1024 });
      const pid = proc.pid;
      runningProcesses.set(id, proc);
      let stdout = "", stderr = "";
      proc.stdout?.on("data", (d: string) => { stdout += d; });
      proc.stderr?.on("data", (d: string) => { stderr += d; });
      proc.on("exit", (code) => {
        result = { id, pid, exitCode: code, stdout, stderr };
      });
      result = { id, pid, status: "running" };
      break;
    }

    case "shell/processes":
      result = runShellCmd("ps aux --sort=-%mem | head -50", 5000);
      break;

    case "shell/which":
      result = runShellCmd(`which ${body.name} 2>/dev/null || command -v ${body.name} 2>/dev/null`, 5000);
      break;

    // ===== Filesystem =====
    case "fs/read": {
      result = fs.readFileSync(body.path, "utf-8");
      break;
    }

    case "fs/write": {
      fs.mkdirSync(path.dirname(body.path), { recursive: true });
      fs.writeFileSync(body.path, body.content, "utf-8");
      result = { path: body.path, bytes: body.content.length };
      break;
    }

    case "fs/append": {
      fs.appendFileSync(body.path, body.content, "utf-8");
      result = { path: body.path };
      break;
    }

    case "fs/delete": {
      fs.unlinkSync(body.path);
      result = { deleted: body.path };
      break;
    }

    case "fs/list": {
      const entries = fs.readdirSync(body.path, { withFileTypes: true });
      result = entries.map(e => ({
        name: e.name,
        isFile: e.isFile(),
        isDir: e.isDirectory(),
        isSymlink: e.isSymbolicLink(),
      }));
      break;
    }

    case "fs/exists":
      result = fs.existsSync(body.path);
      break;

    case "fs/stat": {
      const s = fs.statSync(body.path);
      result = {
        path: body.path,
        size: s.size,
        isFile: s.isFile(),
        isDir: s.isDirectory(),
        mtimeMs: s.mtimeMs,
        birthtimeMs: s.birthtimeMs,
        mode: s.mode,
      };
      break;
    }

    case "fs/move": {
      fs.renameSync(body.from, body.to);
      result = { from: body.from, to: body.to };
      break;
    }

    case "fs/copy": {
      fs.cpSync(body.from, body.to, { recursive: true });
      result = { from: body.from, to: body.to };
      break;
    }

    case "fs/mkdir": {
      fs.mkdirSync(body.path, { recursive: body.recursive ?? true });
      result = { path: body.path };
      break;
    }

    case "fs/grep": {
      const dir = body.path || ".";
      const include = body.include ? `--include="${body.include}"` : "";
      const grepResult = runShellCmd(
        `rg -n --no-heading ${include} "${body.pattern}" ${dir} 2>/dev/null || grep -rn ${include} "${body.pattern}" ${dir} 2>/dev/null`,
        15000,
      );
      if (grepResult.exitCode !== 0) { result = []; break; }
      const max = body.maxResults ?? 200;
      result = grepResult.stdout.trim().split("\n").filter(Boolean).slice(0, max).map((line: string) => {
        const idx = line.indexOf(":");
        if (idx > 0) {
          const rest = line.slice(idx + 1);
          const restIdx = rest.indexOf(":");
          if (restIdx > 0) {
            return { path: line.slice(0, idx), line: Number(rest.slice(0, restIdx)) || 0, text: rest.slice(restIdx + 1) };
          }
        }
        return { path: line, line: 0, text: "" };
      });
      break;
    }

    case "fs/glob": {
      const baseDir = body.cwd || ".";
      const findResult = runShellCmd(`find "${baseDir}" -type f 2>/dev/null | head -5000`, 15000);
      if (findResult.exitCode !== 0) { result = []; break; }
      const files = findResult.stdout.trim().split("\n").filter(Boolean);
      const re = new RegExp("^" + String(body.pattern).replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$");
      result = files.filter(f => re.test(f.startsWith(baseDir) ? f.slice(baseDir.length + 1) : f)).slice(0, 200);
      break;
    }

    case "fs/disk-usage": {
      const target = body.path || ".";
      result = runShellCmd(`du -sh "${target}" 2>/dev/null; echo "---"; df -h "${target}" 2>/dev/null`, 10000);
      break;
    }

    // ===== Code execution =====
    case "code/python": {
      const tmpPy = `/tmp/alice_py_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.py`;
      try {
        fs.writeFileSync(tmpPy, body.code, "utf-8");
        result = runShellCmd(`python3 "${tmpPy}"`, body.timeout || 30000);
      } finally {
        try { fs.unlinkSync(tmpPy); } catch {}
      }
      break;
    }

    case "code/node": {
      const tmpJs = `/tmp/alice_js_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mjs`;
      try {
        fs.writeFileSync(tmpJs, body.code, "utf-8");
        result = runShellCmd(`node "${tmpJs}"`, body.timeout || 30000);
      } finally {
        try { fs.unlinkSync(tmpJs); } catch {}
      }
      break;
    }

    case "code/bash": {
      const tmpSh = `/tmp/alice_sh_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.sh`;
      try {
        fs.writeFileSync(tmpSh, body.code, "utf-8");
        fs.chmodSync(tmpSh, 0o755);
        result = runShellCmd(`bash "${tmpSh}"`, body.timeout || 30000);
      } finally {
        try { fs.unlinkSync(tmpSh); } catch {}
      }
      break;
    }

    // ===== System =====
    case "system/info":
      result = {
        platform: os.platform(),
        release: os.release(),
        hostname: os.hostname(),
        arch: os.arch(),
        cpus: os.cpus().length,
        memoryTotal: os.totalmem(),
        memoryFree: os.freemem(),
        uptime: os.uptime(),
        homedir: os.homedir(),
        tmpdir: os.tmpdir(),
        loadavg: os.loadavg(),
      };
      break;

    case "system/network": {
      const ifaces = os.networkInterfaces();
      result = {};
      for (const [name, addrs] of Object.entries(ifaces)) {
        if (!addrs) continue;
        result[name] = addrs.filter(a => a.family === "IPv4").map(a => a.address);
      }
      break;
    }

    case "system/dns": {
      try {
        result = await dns.resolve4(body.hostname);
      } catch {
        try { result = await dns.resolve6(body.hostname); }
        catch (e: any) { result = `ERROR: ${e.message}`; }
      }
      break;
    }

    case "system/env":
      result = body.key ? process.env[body.key] ?? null : undefined;
      break;

    case "system/cwd":
      result = process.cwd();
      break;

    // ===== HTTP Proxy =====
    case "http/fetch": {
      const resp = await fetch(body.url, {
        method: body.method || "GET",
        headers: body.headers,
        body: body.body,
      });
      const text = await resp.text();
      const headers: Record<string, string> = {};
      resp.headers.forEach((v, k) => { headers[k] = v; });
      result = { status: resp.status, body: text, headers };
      break;
    }

    // ===== Health =====
    case "health":
      result = { status: "ok", pid: process.pid, uptime: process.uptime() };
      break;

    default:
      res.writeHead(404);
      res.end(JSON.stringify({ error: `Unknown route: ${route}` }));
      return;
  }

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result));
}

function readBody(req: IncomingMessage): Promise<any> {
  return new Promise((resolve) => {
    if (req.method === "GET") { resolve({}); return; }
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw) { resolve({}); return; }
      try { resolve(JSON.parse(raw)); }
      catch { resolve({ raw }); }
    });
  });
}

// Start server
const server = createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`\n  🐇 Alice Agent Server running on http://localhost:${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api/<route>`);
  console.log(`  Health: http://localhost:${PORT}/api/health\n`);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n  Shutting down Alice Agent Server...");
  for (const proc of runningProcesses.values()) {
    try { proc.kill(); } catch {}
  }
  server.close(() => process.exit(0));
});

process.on("SIGTERM", () => {
  server.close(() => process.exit(0));
});
