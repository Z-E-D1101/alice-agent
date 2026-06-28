import { useEffect, useRef, useState } from "react";
import { Square, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function Composer({
  onSend, onAbort, busy, disabled,
}: {
  onSend: (text: string) => void;
  onAbort: () => void;
  busy: boolean;
  disabled?: boolean;
}) {
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { ref.current?.focus(); }, []);
  useEffect(() => { if (!busy) ref.current?.focus(); }, [busy]);

  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    setText("");
    onSend(t);
  };

  return (
    <div className="border-t border-border bg-card/40 px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2 rounded-2xl border border-border bg-input/60 px-3 py-2 focus-within:border-primary/60 transition-colors">
        <textarea
          ref={ref}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
          }}
          placeholder={disabled ? "Pick a model up top, then message Alice…" : "Message Alice  (Shift+Enter for newline)"}
          rows={1}
          className="flex-1 resize-none bg-transparent outline-none text-sm placeholder:text-muted-foreground/70 max-h-48 py-1.5"
          style={{ minHeight: 28 }}
          onInput={(e) => {
            const el = e.currentTarget;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 200) + "px";
          }}
        />
        <Button
          type="button"
          size="icon"
          onClick={busy ? onAbort : submit}
          disabled={!busy && (disabled || !text.trim())}
          className={cn(
            "h-9 w-9 rounded-full shrink-0 transition-all",
            busy
              ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
          aria-label={busy ? "Abort" : "Send"}
        >
          {busy ? <Square className="h-4 w-4 fill-current" /> : <ArrowUp className="h-4 w-4" />}
        </Button>
      </div>
      <div className="mx-auto mt-1.5 max-w-3xl px-1 text-[10px] text-muted-foreground/70 hidden md:block">
        Alice runs as a local agent with real shell & filesystem access via Agent Server.
      </div>
    </div>
  );
}
