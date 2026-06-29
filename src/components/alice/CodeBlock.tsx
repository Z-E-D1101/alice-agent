import { useState, useCallback, useRef, useEffect, type ReactNode } from "react";

function extractText(node: ReactNode): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(extractText).join("");
  if (node && typeof node === "object" && "props" in node) {
    return extractText((node as any).props.children);
  }
  return "";
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }, [text]);
  return (
    <button type="button" className="copy-btn" onClick={copy}>
      {copied ? "Copied!" : "Copy"}
    </button>
  );
}

export function CodeBlock({ className, children }: { className?: string; children: ReactNode }) {
  const match = /language-(\w+)/.exec(className || "");
  const codeStr = extractText(children);
  const preRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const pre = preRef.current;
    if (!pre) return;
    let scrollLeft = 0;
    const save = () => { scrollLeft = pre.scrollLeft; };
    pre.addEventListener("scroll", save, { passive: true });
    return () => {
      pre.removeEventListener("scroll", save);
      if (pre) pre.scrollLeft = scrollLeft;
    };
  }, []);

  if (!match) {
    return <code className="alice-inline-code">{children}</code>;
  }

  return (
    <div className="alice-code-block">
      <div className="alice-code-block-header">
        <span className="lang-label">{match[1]}</span>
        <CopyButton text={codeStr} />
      </div>
      <pre ref={preRef}>
        <code className={className}>{children}</code>
      </pre>
    </div>
  );
}
