import type { Message } from "@/lib/alice/types";
import { ThinkingPanel } from "./ThinkingPanel";
import { ToolCallLine } from "./ToolCallLine";
import { MarkdownRenderer } from "./MarkdownRenderer";

export function MessageView({ msg, live }: { msg: Message; live?: boolean }) {
  if (msg.role === "tool") return null;
  if (msg.role === "user") {
    return (
      <div className="flex justify-end alice-fade-in px-1">
        <div
          className="rounded-[22px] rounded-br-[6px] px-4 py-2.5 whitespace-pre-wrap text-[15px] leading-relaxed"
          style={{ backgroundColor: "#2F2F2F", color: "#FFFFFF", maxWidth: "75%" }}
        >
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="alice-fade-in space-y-3 px-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "#10a37f" }} />
        <span className="font-medium" style={{ color: "#10a37f" }}>Alice</span>
      </div>
      {msg.reasoning && <ThinkingPanel text={msg.reasoning} live={!!live} />}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="space-y-1">
          {msg.toolCalls.map((tc) => <ToolCallLine key={tc.id} tc={tc} />)}
        </div>
      )}
      {msg.content && (
        <div className={live ? "alice-streaming" : ""}>
          <MarkdownRenderer content={msg.content} live={live} />
        </div>
      )}
    </div>
  );
}
