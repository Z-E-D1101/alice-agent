import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useState, useCallback } from "react";
import type { Message } from "@/lib/alice/types";
import { ThinkingPanel } from "./ThinkingPanel";
import { ToolCallLine } from "./ToolCallLine";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); });
  }, [text]);
  return (
    <button className="copy-btn" onClick={copy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

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
        <div
          className="prose prose-sm max-w-none text-[15px] leading-relaxed"
          style={{ color: "#ECECEC" }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              code({ className, children, ...props }: any) {
                const match = /language-(\w+)/.exec(className || "");
                const codeStr = String(children).replace(/\n$/, "");
                if (match) {
                  return (
                    <div className="alice-code-block">
                      <span className="lang-label">{match[1]}</span>
                      <CopyButton text={codeStr} />
                      <pre className={className}>
                        <code>{children}</code>
                      </pre>
                    </div>
                  );
                }
                return <code className="alice-inline-code" {...props}>{children}</code>;
              },
              pre({ children }: any) { return <>{children}</>; },
            }}
          >
            {msg.content}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}
