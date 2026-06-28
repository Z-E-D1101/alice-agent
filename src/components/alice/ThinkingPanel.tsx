import { useState } from "react";
import { Brain, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export function ThinkingPanel({ text, live }: { text: string; live: boolean }) {
  const [open, setOpen] = useState(live);
  if (!text) return null;
  return (
    <div className="rounded-lg border border-border/60 bg-card/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-xs text-thinking">
        <Brain className="h-3.5 w-3.5" />
        <span className={cn("font-medium", live && "alice-pulse")}>{live ? "thinking" : "thought process"}</span>
        <span className="text-muted-foreground">({text.length} chars)</span>
        <ChevronDown className={cn("ml-auto h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap border-t border-border/60 px-3 py-2 text-xs text-thinking/80 font-mono">
          {text}
        </pre>
      )}
    </div>
  );
}
