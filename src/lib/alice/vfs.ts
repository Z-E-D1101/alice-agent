import { loadVFS, saveVFS } from "./storage";

const norm = (p: string) => {
  if (!p.startsWith("/")) p = "/" + p;
  return p.replace(/\/+/g, "/").replace(/\/$/, "") || "/";
};

export function fsRead(path: string): string {
  const p = norm(path);
  const v = loadVFS();
  if (!v[p]) throw new Error(`file not found: ${p}`);
  return v[p].content;
}
export function fsWrite(path: string, content: string) {
  const p = norm(path);
  const v = loadVFS();
  v[p] = { path: p, content, updatedAt: Date.now() };
  saveVFS(v);
  return p;
}
export function fsAppend(path: string, content: string) {
  const p = norm(path);
  const v = loadVFS();
  const prev = v[p]?.content ?? "";
  v[p] = { path: p, content: prev + content, updatedAt: Date.now() };
  saveVFS(v);
  return p;
}
export function fsDelete(path: string) {
  const p = norm(path);
  const v = loadVFS();
  delete v[p];
  saveVFS(v);
  return p;
}
export function fsList(dir: string): string[] {
  const d = norm(dir);
  const v = loadVFS();
  const prefix = d === "/" ? "/" : d + "/";
  const out = new Set<string>();
  for (const p of Object.keys(v)) {
    if (p.startsWith(prefix)) {
      const rest = p.slice(prefix.length);
      if (!rest) continue;
      const seg = rest.split("/")[0];
      out.add(seg);
    }
  }
  return [...out].sort();
}
export function fsExists(path: string): boolean {
  return !!loadVFS()[norm(path)];
}
export function fsStat(path: string) {
  const p = norm(path);
  const v = loadVFS();
  if (!v[p]) throw new Error(`not found: ${p}`);
  return { path: p, size: v[p].content.length, updatedAt: v[p].updatedAt };
}
export function fsMove(from: string, to: string) {
  const a = norm(from), b = norm(to);
  const v = loadVFS();
  if (!v[a]) throw new Error(`not found: ${a}`);
  v[b] = { ...v[a], path: b, updatedAt: Date.now() };
  delete v[a];
  saveVFS(v);
}
export function fsCopy(from: string, to: string) {
  const a = norm(from), b = norm(to);
  const v = loadVFS();
  if (!v[a]) throw new Error(`not found: ${a}`);
  v[b] = { path: b, content: v[a].content, updatedAt: Date.now() };
  saveVFS(v);
}
export function fsGrep(pattern: string, dir = "/"): Array<{ path: string; line: number; text: string }> {
  const re = new RegExp(pattern);
  const v = loadVFS();
  const d = norm(dir);
  const out: Array<{ path: string; line: number; text: string }> = [];
  for (const p of Object.keys(v)) {
    if (d !== "/" && !p.startsWith(d + "/") && p !== d) continue;
    const lines = v[p].content.split("\n");
    lines.forEach((line, i) => { if (re.test(line)) out.push({ path: p, line: i + 1, text: line }); });
  }
  return out.slice(0, 200);
}
export function fsAll() { return Object.values(loadVFS()).map(e => ({ path: e.path, size: e.content.length })); }
