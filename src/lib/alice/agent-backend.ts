/**
 * Client for the Alice Agent Server (agent-server.ts).
 * Falls back to createServerFn (TanStack Start SSR) when agent server is unreachable.
 * All responses are normalized to match the agent server JSON format.
 */

import * as server from "./server-backend";

const AGENT_PORT = Number(import.meta.env.VITE_ALICE_AGENT_PORT || 3020);

let agentUrl = `http://localhost:${AGENT_PORT}/api`;
let fallbackMode = false;
let fallbackWarning = false;

function warnOnce(msg: string) {
  if (!fallbackWarning) {
    console.warn(`[agent-backend] ${msg}`);
    fallbackWarning = true;
  }
}

async function callApi<T>(route: string, body?: unknown): Promise<T> {
  if (fallbackMode) {
    return callServerFn<T>(route, body);
  }

  try {
    const resp = await fetch(`${agentUrl}/${route}`, {
      method: body !== undefined ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new Error(`agent server ${resp.status}`);
    return await resp.json() as T;
  } catch (e) {
    if (!fallbackMode) {
      warnOnce(`Agent server unreachable (${(e as Error).message}), falling back to SSR mode`);
      fallbackMode = true;
    }
    return callServerFn<T>(route, body);
  }
}

// Normalize any value to ExecResult format
function toExecResult(val: any): { stdout: string; stderr: string; exitCode: number } {
  if (val && typeof val === "object" && "stdout" in val) {
    return { stdout: String(val.stdout ?? ""), stderr: String(val.stderr ?? ""), exitCode: Number(val.exitCode ?? 0) };
  }
  return { stdout: val != null ? String(val) : "", stderr: "", exitCode: 0 };
}

async function callServerFn<T>(route: string, body?: unknown): Promise<T> {
  const b = body as Record<string, any> | undefined;

  switch (route) {
    case "shell/run":
    case "shell/exec":
      return toExecResult(await server.runShell({ data: { command: b?.command || "", timeout: b?.timeout || 30000, cwd: b?.cwd } })) as T;

    case "shell/processes": {
      const r = await server.listProcesses();
      return { stdout: r, stderr: "", exitCode: 0 } as T;
    }

    case "shell/which": {
      const r = await server.whichBin({ data: { name: b?.name || "" } });
      return { stdout: r || "", stderr: r ? "" : "not found", exitCode: r ? 0 : 1 } as T;
    }

    case "fs/read":
      return (await server.readTextFile({ data: { path: b?.path || "" } })) as T;

    case "fs/write": {
      await server.writeTextFile({ data: { path: b?.path || "", content: b?.content || "" } });
      return { path: b?.path, bytes: (b?.content || "").length } as T;
    }

    case "fs/append": {
      await server.appendTextFile({ data: { path: b?.path || "", content: b?.content || "" } });
      return { path: b?.path } as T;
    }

    case "fs/delete": {
      await server.deleteFile({ data: { path: b?.path || "" } });
      return { deleted: b?.path } as T;
    }

    case "fs/list": {
      const entries = await server.listDirectory({ data: { path: b?.path || "." } });
      return entries.map((name: string) => ({ name, isFile: true, isDir: false })) as T;
    }

    case "fs/exists":
      return (await server.fileExists({ data: { path: b?.path || "" } })) as T;

    case "fs/stat": {
      const s = await server.fileStat({ data: { path: b?.path || "" } });
      return {
        path: s.path, size: s.size, isFile: s.isFile, isDir: s.isDir, mtimeMs: s.mtimeMs,
        birthtimeMs: 0, mode: 0,
      } as T;
    }

    case "fs/move": {
      await server.moveFile({ data: { from: b?.from || "", to: b?.to || "" } });
      return { from: b?.from, to: b?.to } as T;
    }

    case "fs/copy": {
      await server.copyFile({ data: { from: b?.from || "", to: b?.to || "" } });
      return { from: b?.from, to: b?.to } as T;
    }

    case "fs/mkdir": {
      await server.makeDirectory({ data: { path: b?.path || "", recursive: b?.recursive ?? true } });
      return { path: b?.path } as T;
    }

    case "fs/grep": {
      const r = await server.grepSearch({
        data: {
          pattern: b?.pattern || "",
          path: b?.path || ".",
          include: b?.include,
          maxResults: b?.maxResults || 200,
        },
      });
      return r as T;
    }

    case "fs/glob": {
      const re = new RegExp("^" + String(b?.pattern || "").replace(/\*\*/g, ".*").replace(/\*/g, "[^/]*").replace(/\?/g, ".") + "$");
      const dir = b?.cwd || ".";
      const r = await server.grepSearch({ data: { pattern: ".*", path: dir, maxResults: 5000 } });
      const files = (r as Array<{ path: string }>).map(x => x.path);
      return files.filter((f: string) => re.test(f)).slice(0, 200) as T;
    }

    case "fs/disk-usage": {
      const r = toExecResult(await server.runShell({ data: { command: `du -sh "${b?.path || "."}" 2>/dev/null; echo "---"; df -h "${b?.path || "."}" 2>/dev/null`, timeout: 10000 } }));
      return r as T;
    }

    case "code/python":
      return toExecResult(await server.executePython({ data: { code: b?.code || "", timeout: b?.timeout || 30000 } })) as T;

    case "code/node":
      return toExecResult(await server.executeNode({ data: { code: b?.code || "", timeout: b?.timeout || 30000 } })) as T;

    case "code/bash":
      return toExecResult(await server.runShell({ data: { command: b?.code || "", timeout: b?.timeout || 30000 } })) as T;

    case "system/info": {
      const str = await server.getSystemInfo();
      const lines = str.split("\n");
      const parse = (s: string) => s.split(": ")[1] || "";
      return {
        platform: parse(lines[0] || ""),
        release: "",
        hostname: parse(lines[1] || ""),
        arch: parse(lines[2] || ""),
        cpus: Number(parse(lines[3] || "")) || 0,
        memoryTotal: 0,
        memoryFree: 0,
        uptime: 0,
        homedir: "",
        tmpdir: "",
        loadavg: [],
      } as T;
    }

    case "system/network": {
      const str = await server.getNetworkInfo();
      const result: Record<string, string[]> = {};
      for (const line of str.split("\n")) {
        const [name, ip] = line.split(": ");
        if (name && ip) result[name.trim()] = [ip.trim()];
      }
      return result as T;
    }

    case "system/dns": {
      try { return (await server.dnsResolve({ data: { hostname: b?.hostname || "" } })) as T; }
      catch { return ["ERROR: could not resolve"] as T; }
    }

    case "system/env":
      return (await server.getEnv({ data: { key: b?.key || "" } })) as T;

    case "system/cwd":
      return (await server.getCwd()) as T;

    case "http/fetch": {
      const r = await server.httpRequest({ data: { url: b?.url || "", method: b?.method, headers: b?.headers, body: b?.body } });
      return r as T;
    }

    default:
      throw new Error(`SSR fallback not implemented for route: ${route}`);
  }
}

// Public API — matches agent-server.ts routes
export const agent = {
  shell: {
    run: (cmd: string, timeout?: number, cwd?: string) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("shell/run", { command: cmd, timeout, cwd }),
    exec: (cmd: string, timeout?: number, cwd?: string) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("shell/exec", { command: cmd, timeout, cwd }),
    processes: () => callApi<{ stdout: string; stderr: string; exitCode: number }>("shell/processes"),
    which: (name: string) => callApi<{ stdout: string; stderr: string; exitCode: number }>("shell/which", { name }),
  },

  fs: {
    read: (p: string) => callApi<string>("fs/read", { path: p }),
    write: (p: string, content: string) => callApi<{ path: string; bytes: number }>("fs/write", { path: p, content }),
    append: (p: string, content: string) => callApi<{ path: string }>("fs/append", { path: p, content }),
    delete: (p: string) => callApi<{ deleted: string }>("fs/delete", { path: p }),
    list: (p: string) => callApi<Array<{ name: string; isFile: boolean; isDir: boolean }>>("fs/list", { path: p }),
    exists: (p: string) => callApi<boolean>("fs/exists", { path: p }),
    stat: (p: string) => callApi<any>("fs/stat", { path: p }),
    move: (from: string, to: string) => callApi<any>("fs/move", { from, to }),
    copy: (from: string, to: string) => callApi<any>("fs/copy", { from, to }),
    mkdir: (p: string, recursive?: boolean) => callApi<any>("fs/mkdir", { path: p, recursive }),
    grep: (pattern: string, dir?: string, include?: string, maxResults?: number) =>
      callApi<Array<{ path: string; line: number; text: string }>>("fs/grep", { pattern, path: dir, include, maxResults }),
    glob: (pattern: string, cwd?: string) => callApi<string[]>("fs/glob", { pattern, cwd }),
    diskUsage: (p?: string) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("fs/disk-usage", { path: p }),
  },

  code: {
    python: (code: string, timeout?: number) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("code/python", { code, timeout }),
    node: (code: string, timeout?: number) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("code/node", { code, timeout }),
    bash: (code: string, timeout?: number) =>
      callApi<{ stdout: string; stderr: string; exitCode: number }>("code/bash", { code, timeout }),
  },

  system: {
    info: () => callApi<any>("system/info"),
    network: () => callApi<Record<string, string[]>>("system/network"),
    dns: (hostname: string) => callApi<string[] | string>("system/dns", { hostname }),
    env: (key: string) => callApi<string | null>("system/env", { key }),
    cwd: () => callApi<string>("system/cwd"),
  },

  http: {
    fetch: (url: string, method?: string, headers?: Record<string, string>, body?: string) =>
      callApi<{ status: number; body: string; headers: Record<string, string> }>("http/fetch", { url, method, headers, body }),
  },
};
