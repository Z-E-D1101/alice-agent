import { createServerFn } from "@tanstack/react-start";

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

function validate<T>(d: T): T {
  return d;
}

// ===== Shell =====
export const runShell = createServerFn({ method: "POST" })
  .validator((d: { command: string; timeout?: number; cwd?: string }) => d)
  .handler(async ({ data }) => {
    const { execSync } = await import("node:child_process");
    const cmd = data.command;
    const timeout = data.timeout ?? 30000;
    const cwd = data.cwd;
    try {
      const output = execSync(cmd, {
        encoding: "utf-8",
        timeout,
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { stdout: output, stderr: "", exitCode: 0 } satisfies ExecResult;
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString() || "",
        stderr: e.stderr?.toString() || e.message || String(e),
        exitCode: e.status ?? 1,
      } satisfies ExecResult;
    }
  });

// ===== Filesystem =====
export const readTextFile = createServerFn({ method: "POST" })
  .validator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    return fs.readFileSync(data.path, "utf-8");
  });

export const writeTextFile = createServerFn({ method: "POST" })
  .validator((d: { path: string; content: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.writeFileSync(data.path, data.content, "utf-8");
  });

export const appendTextFile = createServerFn({ method: "POST" })
  .validator((d: { path: string; content: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.appendFileSync(data.path, data.content, "utf-8");
  });

export const deleteFile = createServerFn({ method: "POST" })
  .validator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.unlinkSync(data.path);
  });

export const listDirectory = createServerFn({ method: "POST" })
  .validator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    return fs.readdirSync(data.path);
  });

export const fileExists = createServerFn({ method: "POST" })
  .validator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    return fs.existsSync(data.path);
  });

export const fileStat = createServerFn({ method: "POST" })
  .validator((d: { path: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    const stat = fs.statSync(data.path);
    return {
      path: data.path,
      size: stat.size,
      isFile: stat.isFile(),
      isDir: stat.isDirectory(),
      mtimeMs: stat.mtimeMs,
    };
  });

export const moveFile = createServerFn({ method: "POST" })
  .validator((d: { from: string; to: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.renameSync(data.from, data.to);
  });

export const copyFile = createServerFn({ method: "POST" })
  .validator((d: { from: string; to: string }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.copyFileSync(data.from, data.to);
  });

export const makeDirectory = createServerFn({ method: "POST" })
  .validator((d: { path: string; recursive?: boolean }) => d)
  .handler(async ({ data }) => {
    const fs = await import("node:fs");
    fs.mkdirSync(data.path, { recursive: data.recursive ?? false });
  });

// ===== Code execution =====
export const executePython = createServerFn({ method: "POST" })
  .validator((d: { code: string; timeout?: number }) => d)
  .handler(async ({ data }) => {
    const { execSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const tmpFile = `/tmp/alice_py_${Date.now()}.py`;
    try {
      fs.writeFileSync(tmpFile, data.code, "utf-8");
      const output = execSync(`python3 ${tmpFile}`, {
        encoding: "utf-8",
        timeout: data.timeout ?? 30000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return { stdout: output, stderr: "", exitCode: 0 } satisfies ExecResult;
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString() || "",
        stderr: e.stderr?.toString() || e.message || String(e),
        exitCode: e.status ?? 1,
      } satisfies ExecResult;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

export const executeNode = createServerFn({ method: "POST" })
  .validator((d: { code: string; timeout?: number }) => d)
  .handler(async ({ data }) => {
    const { execSync } = await import("node:child_process");
    const fs = await import("node:fs");
    const tmpFile = `/tmp/alice_js_${Date.now()}.mjs`;
    try {
      fs.writeFileSync(tmpFile, data.code, "utf-8");
      const output = execSync(`node ${tmpFile}`, {
        encoding: "utf-8",
        timeout: data.timeout ?? 30000,
        maxBuffer: 5 * 1024 * 1024,
      });
      return { stdout: output, stderr: "", exitCode: 0 } satisfies ExecResult;
    } catch (e: any) {
      return {
        stdout: e.stdout?.toString() || "",
        stderr: e.stderr?.toString() || e.message || String(e),
        exitCode: e.status ?? 1,
      } satisfies ExecResult;
    } finally {
      try { fs.unlinkSync(tmpFile); } catch {}
    }
  });

// ===== System =====
export const getCwd = createServerFn({ method: "GET" })
  .handler(async () => {
    return process.cwd();
  });

export const getEnv = createServerFn({ method: "POST" })
  .validator((d: { key: string }) => d)
  .handler(async ({ data }) => {
    return process.env[data.key] ?? null;
  });

export const whichBin = createServerFn({ method: "POST" })
  .validator((d: { name: string }) => d)
  .handler(async ({ data }) => {
    const { execSync } = await import("node:child_process");
    try {
      const result = execSync(`which ${data.name} 2>/dev/null || command -v ${data.name} 2>/dev/null`, {
        encoding: "utf-8",
        timeout: 5000,
      });
      return result.trim();
    } catch {
      return null;
    }
  });

export const listProcesses = createServerFn({ method: "GET" })
  .handler(async () => {
    const { execSync } = await import("node:child_process");
    try {
      return execSync("ps aux --sort=-%mem | head -50", { encoding: "utf-8", timeout: 5000 });
    } catch {
      try {
        return execSync("ps aux | head -50", { encoding: "utf-8", timeout: 5000 });
      } catch (e: any) {
        return `ERROR: ${e.message}`;
      }
    }
  });

export const getSystemInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    const os = await import("node:os");
    const parts: string[] = [
      `Platform: ${os.platform()} ${os.release()}`,
      `Hostname: ${os.hostname()}`,
      `Arch: ${os.arch()}`,
      `CPUs: ${os.cpus().length}`,
      `Memory: ${Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10} GB total, ${Math.round((os.freemem() / 1024 / 1024 / 1024) * 10) / 10} GB free`,
      `Uptime: ${Math.round(os.uptime() / 3600)}h`,
    ];
    return parts.join("\n");
  });

export const getNetworkInfo = createServerFn({ method: "GET" })
  .handler(async () => {
    const os = await import("node:os");
    const ifaces = os.networkInterfaces();
    const parts: string[] = [];
    for (const [name, addrs] of Object.entries(ifaces)) {
      if (!addrs) continue;
      for (const addr of addrs) {
        if (addr.family === "IPv4" && !addr.internal) {
          parts.push(`${name}: ${addr.address}`);
        }
      }
    }
    return parts.join("\n") || "No non-internal IPv4 addresses found";
  });

export const dnsResolve = createServerFn({ method: "POST" })
  .validator((d: { hostname: string }) => d)
  .handler(async ({ data }) => {
    const dns = await import("node:dns/promises");
    try {
      const addrs = await dns.resolve4(data.hostname);
      return addrs.join("\n");
    } catch {
      try {
        const addrs = await dns.resolve6(data.hostname);
        return addrs.join("\n");
      } catch (e: any) {
        return `ERROR: ${e.message}`;
      }
    }
  });

export const grepSearch = createServerFn({ method: "POST" })
  .validator((d: { pattern: string; path?: string; include?: string; maxResults?: number }) => d)
  .handler(async ({ data }) => {
    const { execSync } = await import("node:child_process");
    const dir = data.path || ".";
    const include = data.include ? `--include="${data.include}"` : "";
    try {
      const result = execSync(
        `rg -n --no-heading ${include} "${data.pattern}" ${dir} 2>/dev/null || grep -rn ${include} "${data.pattern}" ${dir} 2>/dev/null`,
        { encoding: "utf-8", timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
      );
      const max = data.maxResults ?? 200;
      return result
        .trim()
        .split("\n")
        .filter(Boolean)
        .slice(0, max)
        .map((line) => {
          const idx = line.indexOf(":");
          if (idx > 0) {
            const rest = line.slice(idx + 1);
            const restIdx = rest.indexOf(":");
            if (restIdx > 0) {
              return {
                path: line.slice(0, idx),
                line: Number(rest.slice(0, restIdx)) || 0,
                text: rest.slice(restIdx + 1),
              };
            }
          }
          return { path: line, line: 0, text: "" };
        });
    } catch {
      return [];
    }
  });

export const httpRequest = createServerFn({ method: "POST" })
  .validator((d: { url: string; method?: string; headers?: Record<string, string>; body?: string }) => d)
  .handler(async ({ data }) => {
    const resp = await fetch(data.url, {
      method: data.method || "GET",
      headers: data.headers,
      body: data.body,
    });
    const body = await resp.text();
    const headers: Record<string, string> = {};
    resp.headers.forEach((v, k) => { headers[k] = v; });
    return { status: resp.status, body, headers };
  });
