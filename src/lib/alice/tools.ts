import {
  loadMemory, saveMemory, loadProfile, saveProfile,
  loadSkills, saveSkills, loadTasks, saveTasks, uid,
  loadThreads,
} from "./storage";
import * as vfs from "./vfs";
import type { ScheduledTask, Skill, Thread } from "./types";
import { agent } from "./agent-backend";

export interface ToolDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  emoji: string;
  category: string;
  execute: (args: Record<string, unknown>, ctx: ToolCtx) => Promise<string> | string;
}
export interface ToolCtx {
  searxngUrl: string;
  onSubAction?: (msg: string) => void;
}

const ok = (data: unknown) =>
  typeof data === "string" ? data : JSON.stringify(data, null, 2);

const param = (
  props: Record<string, { type: string; description: string; enum?: string[] }>,
  required: string[] = [],
) => ({ type: "object", properties: props, required, additionalProperties: false });

// Try a backend call, fall back to VFS if it fails
const tryBackend = async <T>(fn: () => Promise<T>, fallback: () => T | Promise<T>): Promise<T> => {
  try {
    return await fn();
  } catch (e) {
    console.warn("[tools] backend call failed, using fallback:", (e as Error).message);
    return await fallback();
  }
};

const tools: ToolDef[] = [
  // ====================================================================
  // Shell & Process (real via backend)
  // ====================================================================
  { name: "run_shell", emoji: "💻", category: "shell",
    description: "Run a real shell command on the server. Supports any command available in PATH.",
    parameters: param({ command: { type: "string", description: "shell command to execute" }, timeout: { type: "string", description: "timeout in ms (default 30000)" }, cwd: { type: "string", description: "working directory (optional)" } }, ["command"]),
    execute: async ({ command, timeout, cwd }) => {
      const r = await agent.shell.run(String(command), Number(timeout) || 30000, cwd ? String(cwd) : undefined);
      let out = "";
      if (r.stdout) out += `[stdout]\n${r.stdout}\n`;
      if (r.stderr) out += `[stderr]\n${r.stderr}\n`;
      out += `[exit code] ${r.exitCode}`;
      return out.trim();
    } },
  { name: "terminal", emoji: "🖥️", category: "shell",
    description: "Alias for run_shell. Execute a shell command on the server.",
    parameters: param({ command: { type: "string", description: "shell command" } }, ["command"]),
    execute: async ({ command }) => {
      const r = await agent.shell.exec(String(command));
      let out = "";
      if (r.stdout) out += `[stdout]\n${r.stdout}\n`;
      if (r.stderr) out += `[stderr]\n${r.stderr}\n`;
      out += `[exit code] ${r.exitCode}`;
      return out.trim();
    } },
  { name: "execute_python", emoji: "🐍", category: "shell",
    description: "Execute Python code on the server and return stdout/stderr.",
    parameters: param({ code: { type: "string", description: "Python code to execute" }, timeout: { type: "string", description: "timeout in ms (default 30000)" } }, ["code"]),
    execute: async ({ code, timeout }) => {
      const r = await agent.code.python(String(code), Number(timeout) || 30000);
      let out = "";
      if (r.stdout) out += `[stdout]\n${r.stdout}\n`;
      if (r.stderr) out += `[stderr]\n${r.stderr}\n`;
      out += `[exit code] ${r.exitCode}`;
      return out.trim();
    } },
  { name: "execute_js", emoji: "🟢", category: "shell",
    description: "Execute Node.js JavaScript code on the server and return stdout/stderr.",
    parameters: param({ code: { type: "string", description: "JS code to execute" }, timeout: { type: "string", description: "timeout in ms (default 30000)" } }, ["code"]),
    execute: async ({ code, timeout }) => {
      const r = await agent.code.node(String(code), Number(timeout) || 30000);
      let out = "";
      if (r.stdout) out += `[stdout]\n${r.stdout}\n`;
      if (r.stderr) out += `[stderr]\n${r.stderr}\n`;
      out += `[exit code] ${r.exitCode}`;
      return out.trim();
    } },
  { name: "process", emoji: "⚙️", category: "shell",
    description: "Alias for list_processes. List running processes on the server.",
    parameters: param({}),
    execute: async () => {
      const r = await agent.shell.processes();
      return r.stdout || r.stderr || "ERROR";
    } },
  { name: "list_processes", emoji: "📊", category: "shell",
    description: "List running processes on the server (top 50 by memory).",
    parameters: param({}),
    execute: async () => {
      const r = await agent.shell.processes();
      return r.stdout || r.stderr || "ERROR";
    } },
  { name: "get_cwd", emoji: "📂", category: "shell",
    description: "Get the current working directory of the server process.",
    parameters: param({}),
    execute: async () => agent.system.cwd() },
  { name: "get_env", emoji: "🔧", category: "shell",
    description: "Get the value of an environment variable on the server.",
    parameters: param({ key: { type: "string", description: "environment variable name" } }, ["key"]),
    execute: async ({ key }) => {
      const val = await agent.system.env(String(key));
      return val !== null ? `${key}=${val}` : `${key} is not set`;
    } },
  { name: "which", emoji: "🔍", category: "shell",
    description: "Find the path of an executable in PATH.",
    parameters: param({ name: { type: "string", description: "executable name" } }, ["name"]),
    execute: async ({ name }) => {
      const r = await agent.shell.which(String(name));
      const path = r.stdout?.trim();
      return path || `${name} not found in PATH`;
    } },

  // ====================================================================
  // Filesystem (real via backend, with VFS fallback)
  // ====================================================================
  { name: "read_file", emoji: "📄", category: "fs",
    description: "Read a file from the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "absolute or relative file path" } }, ["path"]),
    execute: async ({ path }) => tryBackend(
      () => agent.fs.read(String(path)),
      () => vfs.fsRead(String(path)),
    ) },
  { name: "write_file", emoji: "✍️", category: "fs",
    description: "Write (overwrite) a file on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "file path" }, content: { type: "string", description: "file content" } }, ["path", "content"]),
    execute: async ({ path, content }) => {
      const p = String(path), c = String(content);
      return tryBackend(
        () => agent.fs.write(p, c).then(() => `wrote ${p} (${c.length} bytes)`),
        () => `wrote ${vfs.fsWrite(p, c)} (${c.length} bytes)`,
      );
    } },
  { name: "append_file", emoji: "➕", category: "fs",
    description: "Append text to a file on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "file path" }, content: { type: "string", description: "text to append" } }, ["path", "content"]),
    execute: async ({ path, content }) => {
      const p = String(path), c = String(content);
      return tryBackend(
        () => agent.fs.append(p, c).then(() => `appended to ${p}`),
        () => `appended to ${vfs.fsAppend(p, c)}`,
      );
    } },
  { name: "delete_file", emoji: "🗑️", category: "fs",
    description: "Delete a file from the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "file path" } }, ["path"]),
    execute: async ({ path }) => {
      const p = String(path);
      return tryBackend(
        () => agent.fs.delete(p).then(() => `deleted ${p}`),
        () => `deleted ${vfs.fsDelete(p)}`,
      );
    } },
  { name: "list_dir", emoji: "📁", category: "fs",
    description: "List entries in a directory on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "directory path (default .)" } }),
    execute: async ({ path }) => {
      const p = String(path ?? ".");
      return tryBackend(
        () => agent.fs.list(p).then(r => r.map(e => e.name).join("\n")),
        () => vfs.fsList(p).join("\n"),
      );
    } },
  { name: "file_exists", emoji: "❓", category: "fs",
    description: "Check whether a file exists on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "file path" } }, ["path"]),
    execute: async ({ path }) => {
      const p = String(path);
      return tryBackend(
        () => agent.fs.exists(p).then(r => String(r)),
        () => String(vfs.fsExists(p)),
      );
    } },
  { name: "file_stat", emoji: "📊", category: "fs",
    description: "Get file/directory stats (size, type, mtime). Falls back to VFS if server unavailable.",
    parameters: param({ path: { type: "string", description: "file path" } }, ["path"]),
    execute: async ({ path }) => {
      const p = String(path);
      return tryBackend(
        () => agent.fs.stat(p).then(r => ok(r)),
        () => ok(vfs.fsStat(p)),
      );
    } },
  { name: "move_file", emoji: "📦", category: "fs",
    description: "Move or rename a file on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ from: { type: "string", description: "source path" }, to: { type: "string", description: "destination path" } }, ["from", "to"]),
    execute: async ({ from, to }) => {
      const f = String(from), t = String(to);
      return tryBackend(
        () => agent.fs.move(f, t).then(() => `moved ${f} -> ${t}`),
        () => { vfs.fsMove(f, t); return `moved`; },
      );
    } },
  { name: "copy_file", emoji: "📋", category: "fs",
    description: "Copy a file on the real filesystem. Falls back to VFS if server unavailable.",
    parameters: param({ from: { type: "string", description: "source path" }, to: { type: "string", description: "destination path" } }, ["from", "to"]),
    execute: async ({ from, to }) => {
      const f = String(from), t = String(to);
      return tryBackend(
        () => agent.fs.copy(f, t).then(() => `copied ${f} -> ${t}`),
        () => { vfs.fsCopy(f, t); return `copied`; },
      );
    } },
  { name: "make_directory", emoji: "📁", category: "fs",
    description: "Create a directory (mkdir -p style).",
    parameters: param({ path: { type: "string", description: "directory path" }, recursive: { type: "string", description: "create parents (default true)" } }, ["path"]),
    execute: async ({ path, recursive }) => {
      const p = String(path);
      const rec = recursive !== "false";
      return tryBackend(
        () => agent.fs.mkdir(p, rec).then(() => `created directory ${p}`),
        () => `(VFS does not support directories; created in memory)`,
      );
    } },
  { name: "search_files", emoji: "🔍", category: "fs",
    description: "Search file contents with a regex pattern on the real filesystem. Uses ripgrep (rg) or grep.",
    parameters: param({ pattern: { type: "string", description: "regex pattern" }, path: { type: "string", description: "directory to search (default .)" }, include: { type: "string", description: "file glob filter e.g. '*.ts'" }, maxResults: { type: "string", description: "max results (default 200)" } }, ["pattern"]),
    execute: async ({ pattern, path, include, maxResults }) => {
      return tryBackend(
        () => agent.fs.grep(String(pattern), path ? String(path) : ".", include ? String(include) : undefined, Number(maxResults) || 200).then(r => ok(r)),
        () => ok(vfs.fsGrep(String(pattern), String(path ?? "/"))),
      );
    } },
  { name: "glob", emoji: "🌐", category: "fs",
    description: "Find files matching a glob pattern (e.g. **/*.ts). Operates on the real filesystem via server.",
    parameters: param({ pattern: { type: "string", description: "glob pattern" }, cwd: { type: "string", description: "working directory (default server CWD)" } }, ["pattern"]),
    execute: async ({ pattern, cwd }) => {
      const p = String(pattern);
      const baseDir = cwd ? String(cwd) : await agent.system.cwd();
      const matched = await agent.fs.glob(p, baseDir);
      return ok(matched.length ? matched : "No files matched the pattern");
    } },
  { name: "disk_usage", emoji: "💾", category: "fs",
    description: "Show disk usage of a path (du -sh + df -h).",
    parameters: param({ path: { type: "string", description: "path (default .)" } }),
    execute: async ({ path }) => {
      const target = path ? String(path) : ".";
      const r = await agent.fs.diskUsage(target);
      return r.stdout || r.stderr || "ERROR";
    } },

  // ====================================================================
  // System
  // ====================================================================
  { name: "get_system_info", emoji: "🖥️", category: "system",
    description: "Get server system info (OS, CPU, memory, uptime, hostname).",
    parameters: param({}),
    execute: async () => {
      try {
        const info = await agent.system.info();
        const p = (s: any, d = "?") => s ?? d;
        return [
          `Platform: ${p(info.platform)} ${p(info.release)}`,
          `Hostname: ${p(info.hostname)}`,
          `Arch: ${p(info.arch)}`,
          `CPUs: ${p(info.cpus, "0")}`,
          `Memory: ${info.memoryTotal ? (info.memoryTotal / 1024 / 1024 / 1024).toFixed(1) : "?"} GB total, ${info.memoryFree ? (info.memoryFree / 1024 / 1024 / 1024).toFixed(1) : "?"} GB free`,
          `Uptime: ${info.uptime ? (info.uptime / 3600).toFixed(1) : "?"}h`,
        ].join("\n");
      } catch (e: any) {
        return `Failed to get system info: ${e.message}`;
      }
    } },
  { name: "get_network_info", emoji: "🌐", category: "system",
    description: "List network interfaces with IP addresses (server-side).",
    parameters: param({}),
    execute: async () => {
      try {
        const net = await agent.system.network();
        if (!net || typeof net !== "object") return "No network info available";
        const lines = Object.entries(net).map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(", ") : String(v)}`);
        return lines.length ? lines.join("\n") : "No non-internal IPv4 addresses found";
      } catch (e: any) {
        return `Failed to get network info: ${e.message}`;
      }
    } },
  { name: "dns_resolve", emoji: "🔗", category: "system",
    description: "Resolve a hostname to IP address(es).",
    parameters: param({ hostname: { type: "string", description: "hostname to resolve" } }, ["hostname"]),
    execute: async ({ hostname }) => {
      const r = await agent.system.dns(String(hostname));
      return Array.isArray(r) ? r.join("\n") : String(r);
    } },

  // ====================================================================
  // Web (enhanced with server-side HTTP)
  // ====================================================================
  { name: "web_search", emoji: "🌐", category: "web",
    description: "Search the web. Tries SearXNG first, then falls back to DuckDuckGo (via server proxy).",
    parameters: param({ query: { type: "string", description: "search query" }, count: { type: "string", description: "max results (default 8)" } }, ["query"]),
    execute: async ({ query, count }, ctx) => {
      const n = Number(count ?? 8) || 8;
      const q = String(query);
      // Try 1: SearXNG directly
      try {
        const url = `${ctx.searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json&safesearch=0`;
        const r = await fetch(url);
        if (r.ok) {
          const j = await r.json() as { results?: Array<{ title: string; url: string; content: string }> };
          return ok((j.results ?? []).slice(0, n).map(x => ({ title: x.title, url: x.url, snippet: x.content })));
        }
      } catch {}
      // Try 2: SearXNG via server proxy
      try {
        const r = await agent.http.fetch(`${ctx.searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json&safesearch=0`);
        if (r.status === 200) {
          const j = JSON.parse(r.body) as { results?: Array<{ title: string; url: string; content: string }> };
          return ok((j.results ?? []).slice(0, n).map(x => ({ title: x.title, url: x.url, snippet: x.content })));
        }
      } catch {}
      // Try 3: DuckDuckGo lite via server proxy
      try {
        const r = await agent.http.fetch(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(q)}`);
        const html = r.body;
        const results: Array<{ title: string; url: string; snippet: string }> = [];
        const linkRe = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
        const snippetRe = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;
        const links: string[] = [];
        const snippets: string[] = [];
        let m;
        while ((m = linkRe.exec(html)) !== null && links.length < n) {
          const href = m[1];
          if (href && !href.startsWith("#") && !href.startsWith("/")) links.push(href);
        }
        while ((m = snippetRe.exec(html)) !== null && snippets.length < n) {
          snippets.push(m[1].replace(/<[^>]+>/g, "").trim());
        }
        for (let i = 0; i < Math.min(n, links.length); i++) {
          results.push({ title: `Result ${i + 1}`, url: links[i], snippet: snippets[i] || "" });
        }
        if (results.length) return ok(results);
      } catch {}
      // Fallback: tell user SearXNG is needed
      return `Web search requires SearXNG running at ${ctx.searxngUrl}.\nStart it with: docker run -d -p 8080:8080 searxng/searxng\nAlternatively, the query was: ${q}`;
    } },
  { name: "web_search_news", emoji: "📰", category: "web",
    description: "Search news. Tries SearXNG (category=news) first, then DuckDuckGo.",
    parameters: param({ query: { type: "string", description: "query" } }, ["query"]),
    execute: async ({ query }, ctx) => {
      const q = String(query);
      try {
        const url = `${ctx.searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json&categories=news`;
        const r = await fetch(url);
        if (r.ok) {
          const j = await r.json() as { results?: Array<{ title: string; url: string; content: string }> };
          return ok((j.results ?? []).slice(0, 10));
        }
      } catch {}
      try {
        const r = await agent.http.fetch(`${ctx.searxngUrl.replace(/\/$/, "")}/search?q=${encodeURIComponent(q)}&format=json&categories=news`);
        if (r.status === 200) {
          const j = JSON.parse(r.body) as { results?: Array<{ title: string; url: string; content: string }> };
          return ok((j.results ?? []).slice(0, 10));
        }
      } catch {}
      return `News search requires SearXNG at ${ctx.searxngUrl}.\nOtherwise use web_search for general search.`;
    } },
  { name: "fetch_url", emoji: "🔗", category: "web",
    description: "Fetch a URL and return text (truncated to 8000 chars). Falls back to server proxy if CORS blocks.",
    parameters: param({ url: { type: "string", description: "URL" }, max: { type: "string", description: "max chars (default 8000)" } }, ["url"]),
    execute: async ({ url, max }) => {
      const u = String(url);
      const n = Number(max ?? 8000) || 8000;
      try {
        const r = await fetch(u);
        const t = await r.text();
        return t.length > n ? t.slice(0, n) + "\n…[truncated]" : t;
      } catch {
        const r = await agent.http.fetch(u);
        return r.body.length > n ? r.body.slice(0, n) + "\n…[truncated]" : r.body;
      }
    } },
  { name: "fetch_json", emoji: "🧾", category: "web",
    description: "Fetch a URL expecting JSON. Falls back to server proxy if CORS blocks.",
    parameters: param({ url: { type: "string", description: "URL" } }, ["url"]),
    execute: async ({ url }) => {
      const u = String(url);
      try { const r = await fetch(u); return ok(await r.json()); }
      catch { const r = await agent.http.fetch(u); return r.body; }
    } },
  { name: "extract_text", emoji: "📃", category: "web",
    description: "Strip HTML tags from a string and return plain text.",
    parameters: param({ html: { type: "string", description: "html" } }, ["html"]),
    execute: ({ html }) => String(html).replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() },
  { name: "http_request", emoji: "🌍", category: "web",
    description: "Make an HTTP request from the server (bypasses CORS). Returns status, body, headers.",
    parameters: param({ url: { type: "string", description: "URL" }, method: { type: "string", description: "HTTP method (default GET)" }, headers: { type: "string", description: "JSON object of headers" }, body: { type: "string", description: "request body" } }, ["url"]),
    execute: async ({ url, method, headers, body }) => {
      const r = await agent.http.fetch(
        String(url),
        method ? String(method) : "GET",
        headers ? JSON.parse(String(headers)) : undefined,
        body ? String(body) : undefined,
      );
      return ok({ status: r.status, body: r.body.slice(0, 8000), headers: r.headers });
    } },

  // ====================================================================
  // Memory (unchanged)
  // ====================================================================
  { name: "remember", emoji: "🧠", category: "memory",
    description: "Save a fact or preference to long-term memory.",
    parameters: param({ key: { type: "string", description: "short label" }, value: { type: "string", description: "what to remember" } }, ["key", "value"]),
    execute: ({ key, value }) => {
      const m = loadMemory();
      m.push({ id: uid(), key: String(key), value: String(value), createdAt: Date.now() });
      saveMemory(m); return `remembered "${key}"`;
    } },
  { name: "recall", emoji: "🔮", category: "memory",
    description: "Search memory entries (substring/regex on key+value).",
    parameters: param({ query: { type: "string", description: "search text" } }, ["query"]),
    execute: ({ query }) => {
      const re = new RegExp(String(query), "i");
      return ok(loadMemory().filter(m => re.test(m.key) || re.test(m.value)));
    } },
  { name: "list_memories", emoji: "📚", category: "memory",
    description: "List all stored memories.",
    parameters: param({}),
    execute: () => ok(loadMemory()) },
  { name: "forget", emoji: "🧹", category: "memory",
    description: "Delete a memory entry by id.",
    parameters: param({ id: { type: "string", description: "memory id" } }, ["id"]),
    execute: ({ id }) => { saveMemory(loadMemory().filter(m => m.id !== id)); return "forgotten"; } },
  { name: "update_profile", emoji: "👤", category: "memory",
    description: "Update what Alice knows about the user.",
    parameters: param({
      name: { type: "string", description: "user's name" },
      about: { type: "string", description: "who they are" },
      preferences: { type: "string", description: "how they like to be helped" },
    }),
    execute: (a) => {
      const cur = loadProfile();
      saveProfile({
        name: String(a.name ?? cur.name),
        about: String(a.about ?? cur.about),
        preferences: String(a.preferences ?? cur.preferences),
        updatedAt: Date.now(),
      });
      return "profile updated";
    } },
  { name: "get_profile", emoji: "🪞", category: "memory",
    description: "Read the stored user profile.",
    parameters: param({}),
    execute: () => ok(loadProfile()) },
  { name: "summarize", emoji: "📝", category: "memory",
    description: "Return a short truncated summary of a text (heuristic; first 600 chars).",
    parameters: param({ text: { type: "string", description: "text" } }, ["text"]),
    execute: ({ text }) => { const t = String(text); return t.length > 600 ? t.slice(0, 600) + "…" : t; } },

  // ====================================================================
  // Skills (unchanged)
  // ====================================================================
  { name: "save_skill", emoji: "🎓", category: "skills",
    description: "Save a reusable skill (workflow). Use after completing a non-trivial task.",
    parameters: param({
      name: { type: "string", description: "skill name" },
      description: { type: "string", description: "what it does" },
      trigger: { type: "string", description: "when to use it" },
      steps: { type: "string", description: "step-by-step instructions / template" },
    }, ["name", "description", "trigger", "steps"]),
    execute: (a) => {
      const s = loadSkills();
      const skill: Skill = { id: uid(), name: String(a.name), description: String(a.description), trigger: String(a.trigger), steps: String(a.steps), createdAt: Date.now() };
      s.push(skill); saveSkills(s); return `saved skill "${skill.name}" (${skill.id})`;
    } },
  { name: "list_skills", emoji: "📜", category: "skills",
    description: "List all saved skills.",
    parameters: param({}),
    execute: () => ok(loadSkills().map(s => ({ id: s.id, name: s.name, description: s.description, trigger: s.trigger }))) },
  { name: "run_skill", emoji: "▶️", category: "skills",
    description: "Load a saved skill's instructions for the assistant to follow now.",
    parameters: param({ id: { type: "string", description: "skill id or name" } }, ["id"]),
    execute: ({ id }) => {
      const s = loadSkills().find(x => x.id === id || x.name === id);
      if (!s) throw new Error("skill not found");
      return ok(s);
    } },
  { name: "delete_skill", emoji: "❌", category: "skills",
    description: "Delete a skill by id.",
    parameters: param({ id: { type: "string", description: "skill id" } }, ["id"]),
    execute: ({ id }) => { saveSkills(loadSkills().filter(s => s.id !== id)); return "deleted"; } },
  { name: "export_skill", emoji: "📤", category: "skills",
    description: "Export a skill as JSON.",
    parameters: param({ id: { type: "string", description: "skill id" } }, ["id"]),
    execute: ({ id }) => {
      const s = loadSkills().find(x => x.id === id);
      if (!s) throw new Error("not found");
      return JSON.stringify(s, null, 2);
    } },
  { name: "import_skill", emoji: "📥", category: "skills",
    description: "Import a skill from JSON.",
    parameters: param({ json: { type: "string", description: "skill JSON" } }, ["json"]),
    execute: ({ json }) => {
      const parsed = JSON.parse(String(json)) as Skill;
      const all = loadSkills();
      const sk: Skill = { ...parsed, id: uid(), createdAt: Date.now() };
      all.push(sk); saveSkills(all);
      return `imported "${sk.name}"`;
    } },

  // ====================================================================
  // Tasks / Scheduler (unchanged)
  // ====================================================================
  { name: "create_task", emoji: "⏰", category: "tasks",
    description: "Schedule a recurring task. Schedule examples: 'every 60m', 'every 24h', 'daily 09:00'.",
    parameters: param({
      name: { type: "string", description: "task name" },
      prompt: { type: "string", description: "what Alice should do when it fires" },
      schedule: { type: "string", description: "schedule string" },
    }, ["name", "prompt", "schedule"]),
    execute: ({ name, prompt, schedule }) => {
      const t = parseSchedule(String(schedule));
      const task: ScheduledTask = {
        id: uid(), name: String(name), prompt: String(prompt), schedule: String(schedule),
        intervalMs: t.intervalMs, dailyAt: t.dailyAt, nextRun: t.nextRun, enabled: true,
      };
      const all = loadTasks(); all.push(task); saveTasks(all);
      return `scheduled "${task.name}" — next run ${new Date(task.nextRun).toLocaleString()}`;
    } },
  { name: "list_tasks", emoji: "📅", category: "tasks",
    description: "List scheduled tasks.",
    parameters: param({}),
    execute: () => ok(loadTasks()) },
  { name: "cancel_task", emoji: "🛑", category: "tasks",
    description: "Delete a scheduled task by id.",
    parameters: param({ id: { type: "string", description: "task id" } }, ["id"]),
    execute: ({ id }) => { saveTasks(loadTasks().filter(t => t.id !== id)); return "cancelled"; } },
  { name: "run_task_now", emoji: "⚡", category: "tasks",
    description: "Mark a task to fire on the next scheduler tick (within ~5s).",
    parameters: param({ id: { type: "string", description: "task id" } }, ["id"]),
    execute: ({ id }) => {
      const all = loadTasks(); const t = all.find(x => x.id === id); if (!t) throw new Error("not found");
      t.nextRun = Date.now(); saveTasks(all); return "queued";
    } },

  // ====================================================================
  // Session / History
  // ====================================================================
  { name: "session_search", emoji: "📋", category: "memory",
    description: "Search past conversation threads by keyword. Returns matching thread titles and message snippets.",
    parameters: param({ query: { type: "string", description: "search keywords" } }, ["query"]),
    execute: ({ query }) => {
      const threads = loadThreads();
      const q = String(query).toLowerCase();
      const results: Array<{ thread: string; snippet: string }> = [];
      for (const t of threads) {
        if (t.title.toLowerCase().includes(q)) {
          const lastMsg = t.messages[t.messages.length - 1];
          results.push({ thread: t.title, snippet: lastMsg ? lastMsg.content.slice(0, 200) : "(no messages)" });
          continue;
        }
        for (const m of t.messages) {
          if (m.content.toLowerCase().includes(q)) {
            results.push({ thread: t.title, snippet: m.content.slice(0, 200) });
            if (results.length >= 20) break;
          }
        }
        if (results.length >= 20) break;
      }
      return ok(results.slice(0, 20));
    } },

  // ====================================================================
  // Utilities
  // ====================================================================
  { name: "calculate", emoji: "🧮", category: "shell",
    description: "Evaluate a math expression. + - * / % ** parentheses, Math.*.",
    parameters: param({ expr: { type: "string", description: "expression" } }, ["expr"]),
    execute: ({ expr }) => {
      const e = String(expr);
      if (!/^[\s0-9+\-*/%().,a-zA-Z_]*$/.test(e)) throw new Error("invalid chars");
      const fn = new Function("Math", `return (${e})`);
      return String(fn(Math));
    } },
  { name: "get_time", emoji: "🕒", category: "shell",
    description: "Get current date/time.",
    parameters: param({ tz: { type: "string", description: "IANA tz (optional)" } }),
    execute: ({ tz }) => new Date().toLocaleString(undefined, tz ? { timeZone: String(tz) } : undefined) },
  { name: "generate_uuid", emoji: "🆔", category: "shell",
    description: "Generate a UUID.",
    parameters: param({}),
    execute: () => uid() },
  { name: "head", emoji: "⬆️", category: "fs",
    description: "Read the first N lines of a file from the real filesystem.",
    parameters: param({ path: { type: "string", description: "file path" }, lines: { type: "string", description: "number of lines (default 10)" } }, ["path"]),
    execute: async ({ path, lines }) => {
      const n = Number(lines) || 10;
      return tryBackend(
        () => agent.shell.exec(`head -n ${n} "${String(path)}"`).then(r => r.stdout || r.stderr),
        () => vfs.fsRead(String(path)).split("\n").slice(0, n).join("\n"),
      );
    } },
  { name: "tail", emoji: "⬇️", category: "fs",
    description: "Read the last N lines of a file from the real filesystem.",
    parameters: param({ path: { type: "string", description: "file path" }, lines: { type: "string", description: "number of lines (default 10)" } }, ["path"]),
    execute: async ({ path, lines }) => {
      const n = Number(lines) || 10;
      return tryBackend(
        () => agent.shell.exec(`tail -n ${n} "${String(path)}"`).then(r => r.stdout || r.stderr),
        () => vfs.fsRead(String(path)).split("\n").slice(-n).join("\n"),
      );
    } },
  { name: "tree", emoji: "🌳", category: "fs",
    description: "Display directory tree structure (like the `tree` command).",
    parameters: param({ path: { type: "string", description: "directory path (default .)" }, depth: { type: "string", description: "max depth (default 3)" } }),
    execute: async ({ path, depth }) => {
      const p = path ? String(path) : ".";
      const d = depth ? String(depth) : "3";
      const r = await agent.shell.exec(`find "${p}" -maxdepth ${d} -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | sort | head -200`);
      return r.stdout || r.stderr || "(empty)";
    } },
  { name: "wc", emoji: "📊", category: "fs",
    description: "Count lines, words, and characters in a file.",
    parameters: param({ path: { type: "string", description: "file path" } }, ["path"]),
    execute: async ({ path }) => {
      const p = String(path);
      return tryBackend(
        () => agent.shell.exec(`wc "${p}"`).then(r => r.stdout || r.stderr),
        () => {
          const t = vfs.fsRead(p);
          return `lines:${t.split("\n").length} words:${t.split(/\s+/).filter(Boolean).length} chars:${t.length}`;
        },
      );
    } },
];

export const TOOLS = tools;
export const TOOLS_BY_NAME: Record<string, ToolDef> = Object.fromEntries(tools.map(t => [t.name, t]));

export function parseSchedule(s: string): { intervalMs?: number; dailyAt?: string; nextRun: number } {
  const lower = s.toLowerCase().trim();
  const every = /^every\s+(\d+)\s*(s|sec|m|min|h|hr|d|day)/.exec(lower);
  if (every) {
    const n = Number(every[1]);
    const u = every[2];
    const mult = u.startsWith("s") ? 1000 : u.startsWith("m") ? 60_000 : u.startsWith("h") ? 3600_000 : 86_400_000;
    const intervalMs = n * mult;
    return { intervalMs, nextRun: Date.now() + intervalMs };
  }
  const daily = /^daily\s+(\d{1,2}):(\d{2})/.exec(lower);
  if (daily) {
    const hh = Number(daily[1]), mm = Number(daily[2]);
    const now = new Date();
    const next = new Date(now); next.setHours(hh, mm, 0, 0);
    if (next.getTime() <= now.getTime()) next.setDate(next.getDate() + 1);
    return { dailyAt: `${hh.toString().padStart(2,"0")}:${mm.toString().padStart(2,"0")}`, nextRun: next.getTime() };
  }
  return { intervalMs: 3600_000, nextRun: Date.now() + 3600_000 };
}

export function toolsForApi() {
  return TOOLS.map(t => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}
