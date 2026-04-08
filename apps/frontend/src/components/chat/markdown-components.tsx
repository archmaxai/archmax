import { useState, type ComponentPropsWithoutRef } from "react";
import type { Components } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn, Button } from "@semlayer/ui";
import { Check, Copy } from "lucide-react";

const remarkPlugins = [remarkGfm];

export const markdownComponents: Components = {
  code: function Code({
    className,
    children,
    ...props
  }: ComponentPropsWithoutRef<"code">) {
    const match = /language-(\w+)/.exec(className || "");
    const codeString = String(children).replace(/\n$/, "");
    const isInline = !match && !codeString.includes("\n");

    if (isInline) {
      return (
        <code className="rounded bg-background px-1.5 py-0.5 font-mono text-[0.85em]" {...props}>
          {children}
        </code>
      );
    }

    return <CodeBlock language={match?.[1]} {...props}>{children}</CodeBlock>;
  },

  p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,

  ul: ({ children }) => (
    <ul className="mb-2 ml-4 list-disc space-y-1 last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 ml-4 list-decimal space-y-1 last:mb-0">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-1">{children}</li>,

  h1: ({ children }) => (
    <h1 className="mb-2 mt-4 text-xl font-bold first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-2 mt-3 text-lg font-bold first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-2 mt-3 text-base font-bold first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-1 mt-2 text-sm font-bold first:mt-0">{children}</h4>
  ),

  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex max-w-full items-center rounded-full bg-foreground/[0.06] px-2 py-0.5 align-middle no-underline whitespace-normal break-words text-muted-foreground transition-colors hover:bg-foreground/[0.10] hover:text-foreground/90"
    >
      <span className="min-w-0 text-xs leading-snug">{children}</span>
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-muted-foreground/50 pl-3 italic">
      {children}
    </blockquote>
  ),

  table: ({ children }) => (
    <div className="my-2 overflow-x-auto">
      <table className="min-w-full border-collapse text-sm">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border/50">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border/30 last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1.5 text-left font-semibold">{children}</th>
  ),
  td: ({ children }) => <td className="px-2 py-1.5">{children}</td>,

  hr: () => <hr className="my-4 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Button
      variant="ghost"
      size="icon-xs"
      className="opacity-0 transition-opacity group-hover/code:opacity-100"
      onClick={copy}
    >
      {copied ? (
        <Check className="h-3 w-3 text-green-500" />
      ) : (
        <Copy className="h-3 w-3" />
      )}
    </Button>
  );
}

function CodeBlock({
  language,
  children,
  ...props
}: ComponentPropsWithoutRef<"code"> & { language?: string }) {
  const codeString = String(children).replace(/\n$/, "");

  return (
    <div className="group/code relative my-3 overflow-hidden rounded-lg border border-border/50">
      {language && (
        <div className="flex items-center justify-between border-b border-border/50 bg-muted/50 px-3 py-1.5">
          <span className="text-xs font-medium text-muted-foreground">
            {language}
          </span>
          <CopyButton text={codeString} />
        </div>
      )}
      <pre className={cn("overflow-x-auto p-3", !language && "pt-8")}>
        {!language && (
          <div className="absolute right-2 top-2">
            <CopyButton text={codeString} />
          </div>
        )}
        <code className="font-mono text-sm" {...props}>
          {children}
        </code>
      </pre>
    </div>
  );
}

export function MarkdownContent({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0", className)}>
      <Markdown remarkPlugins={remarkPlugins} components={markdownComponents}>
        {content}
      </Markdown>
    </div>
  );
}
