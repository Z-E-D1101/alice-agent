import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { CodeBlock } from "./CodeBlock";

export function MarkdownRenderer({ content, live: _live }: { content: string; live?: boolean }) {
  return (
    <div className="prose prose-sm max-w-none text-[15px] leading-relaxed" style={{ color: "#ECECEC" }}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // ===== Headings =====
          h1: ({ children, ...props }: any) => <h1 className="alice-md-h1" {...props}>{children}</h1>,
          h2: ({ children, ...props }: any) => <h2 className="alice-md-h2" {...props}>{children}</h2>,
          h3: ({ children, ...props }: any) => <h3 className="alice-md-h3" {...props}>{children}</h3>,
          h4: ({ children, ...props }: any) => <h4 className="alice-md-h4" {...props}>{children}</h4>,

          // ===== Paragraph & Text =====
          p: ({ children, ...props }: any) => <p className="alice-md-p" {...props}>{children}</p>,

          // ===== Links =====
          a: ({ children, ...props }: any) => <a className="alice-md-a" {...props}>{children}</a>,

          // ===== Lists =====
          ul: ({ children, ...props }: any) => <ul className="alice-md-ul" {...props}>{children}</ul>,
          ol: ({ children, ...props }: any) => <ol className="alice-md-ol" {...props}>{children}</ol>,
          li: ({ children, ...props }: any) => <li className="alice-md-li" {...props}>{children}</li>,

          // ===== Blockquote =====
          blockquote: ({ children, ...props }: any) => <blockquote className="alice-md-blockquote" {...props}>{children}</blockquote>,

          // ===== Code (inline + block) =====
          code({ className, children, ...props }: any) {
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          pre({ children }: any) { return <>{children}</>; },

          // ===== Tables =====
          table({ children }: any) { return <div className="alice-table-wrapper"><table className="alice-md-table">{children}</table></div>; },
          thead: ({ children, ...props }: any) => <thead {...props}>{children}</thead>,
          tbody: ({ children, ...props }: any) => <tbody {...props}>{children}</tbody>,
          tr: ({ children, ...props }: any) => <tr className="alice-md-tr" {...props}>{children}</tr>,
          th: ({ children, ...props }: any) => <th className="alice-md-th" {...props}>{children}</th>,
          td: ({ children, ...props }: any) => <td className="alice-md-td" {...props}>{children}</td>,

          // ===== Dividers =====
          hr: (props: any) => <hr className="alice-md-hr" {...props} />,

          // ===== Tasklist (checklist) =====
          input: (props: any) => <input className="alice-md-input" {...props} />,
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
