import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/alice/types";
import { ThinkingPanel } from "./ThinkingPanel";
import { ToolCallLine } from "./ToolCallLine";
import { cn } from "@/lib/utils";

export function MessageView({ msg, live }: { msg: Message; live?: boolean }) {
  if (msg.role === "tool") return null;
  if (msg.role === "user") {
    return (
      <div className="flex justify-end alice-fade-in">
        <div
          className="max-w-[80%] rounded-2xl rounded-tr-sm px-4 py-2.5 whitespace-pre-wrap"
          style={{ backgroundColor: "#2F2F2F", color: "#FFFFFF" }}
        >
          {msg.content}
        </div>
      </div>
    );
  }
  return (
    <div className="alice-fade-in space-y-2">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-block h-2 w-2 rounded-full bg-primary" />
        <span className="font-medium">Alice</span>
      </div>
      {msg.reasoning && <ThinkingPanel text={msg.reasoning} live={!!live} />}
      {msg.toolCalls && msg.toolCalls.length > 0 && (
        <div className="space-y-1">
          {msg.toolCalls.map((tc) => <ToolCallLine key={tc.id} tc={tc} />)}
        </div>
      )}
      {msg.content && (
        <div
          className="prose prose-sm max-w-none prose-pre:border prose-pre:border-border"
          style={{ color: "#ECECEC" }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
        </div>
      )}
    </div>
  );
}
