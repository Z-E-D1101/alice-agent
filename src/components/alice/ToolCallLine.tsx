import { useState } from "react";
import type { ToolCall } from "@/lib/alice/types";
import { TOOLS_BY_NAME } from "@/lib/alice/tools";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function shortArg(args: string, name: string): string {
  try {
    const j = JSON.parse(args || "{}") as Record<string, unknown>;
    const order = ["path", "query", "command", "url", "expr", "key", "name", "from", "id", "pattern", "schedule"];
    for (const k of order) if (k in j) return String(j[k]).slice(0, 80);
    const first = Object.values(j)[0];
    return first === undefined ? "" : String(first).slice(0, 80);
  } catch { return ""; }
}

const verbFor = (n: string) => {
  if (n.startsWith("read")) return "read";
  if (n.startsWith("write") || n.startsWith("append")) return "write";
  if (n === "grep") return "grep";
  if (n === "websearch" || n === "web_search_news") return "search";
  if (n === "fetch_url" || n === "fetch_json") return "fetch";
  if (n === "run_shell") return "shell";
  if (n === "remember") return "save";
  if (n === "recall" || n === "list_memories") return "recall";
  if (n.includes("skill")) return "skill";
  if (n.includes("task")) return "task";
  return n;
};

export function ToolCallLine({ tc }: { tc: ToolCall }) {
  const [open, setOpen] = useState(false);
  const def = TOOLS_BY_NAME[tc.name];
  const emoji = def?.emoji ?? "🔧";
  const arg = shortArg(tc.args, tc.name);
  const dur = tc.endedAt && tc.startedAt ? ((tc.endedAt - tc.startedAt) / 1000).toFixed(1) + "s" : "";

  return (
    <div className="text-sm font-mono alice-fade-in">
      {tc.status === "preparing" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{emoji}</span>
          <span className="alice-pulse">preparing {tc.name}…</span>
        </div>
      )}
      {(tc.status === "running" || tc.status === "done" || tc.status === "error") && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="group flex w-full items-center gap-2 text-left transition-colors hover:text-foreground"
        >
          <ChevronRight className={cn("h-3 w-3 transition-transform text-muted-foreground", open && "rotate-90")} />
          <span>{emoji}</span>
          <span className="text-tool">{verbFor(tc.name)}</span>
          {arg && <span className="text-muted-foreground truncate">{arg}</span>}
          {tc.status === "running" && <span className="text-muted-foreground alice-pulse">·running</span>}
          {tc.status === "error" && <span className="text-destructive">·error</span>}
          {dur && <span className="ml-auto text-xs text-muted-foreground">{dur}</span>}
        </button>
      )}
      {open && (tc.status === "done" || tc.status === "error") && (
        <div className="mt-1 ml-5 space-y-2 border-l border-border pl-3">
          {tc.args && (
            <div>
              <div className="text-xs text-muted-foreground">args</div>
              <pre className="text-xs whitespace-pre-wrap break-all text-muted-foreground">{tc.args}</pre>
            </div>
          )}
          <div>
            <div className="text-xs text-muted-foreground">{tc.status === "error" ? "error" : "result"}</div>
            <pre className={cn("text-xs whitespace-pre-wrap break-all max-h-64 overflow-auto", tc.status === "error" ? "text-destructive" : "text-foreground/80")}>
              {tc.result ?? ""}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
