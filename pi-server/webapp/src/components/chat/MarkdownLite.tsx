import { Fragment, type ReactNode } from "react";

// Markdown-lite rendered as SAFE React nodes — never dangerouslySetInnerHTML.
// The model/user text is escaped by construction (React escapes text children),
// so an <img onerror> in a reply can never execute and read the API key.

// Split on triple-backtick fences into alternating text / code blocks.
function splitFences(text: string): { code: boolean; content: string; lang?: string }[] {
  const parts: { code: boolean; content: string; lang?: string }[] = [];
  const re = /```(\w*)\n?([\s\S]*?)```/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ code: false, content: text.slice(last, m.index) });
    parts.push({ code: true, lang: m[1] || undefined, content: m[2].replace(/\n$/, "") });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push({ code: false, content: text.slice(last) });
  return parts;
}

// Inline **bold**, *italic*, `code` -> React nodes. Order matters; we tokenise
// with a single regex and wrap each match in the right element.
function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+?)`/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) nodes.push(<Fragment key={`${keyBase}-t${i}`}>{text.slice(last, m.index)}</Fragment>);
    if (m[1] !== undefined) {
      nodes.push(
        <strong key={`${keyBase}-b${i}`} className="font-semibold">
          {m[1]}
        </strong>,
      );
    } else if (m[2] !== undefined) {
      nodes.push(<em key={`${keyBase}-i${i}`}>{m[2]}</em>);
    } else if (m[3] !== undefined) {
      nodes.push(
        <code key={`${keyBase}-c${i}`} className="rounded bg-paper-3 px-1 py-0.5 text-[0.85em] tnum">
          {m[3]}
        </code>,
      );
    }
    last = re.lastIndex;
    i += 1;
  }
  if (last < text.length) nodes.push(<Fragment key={`${keyBase}-tail`}>{text.slice(last)}</Fragment>);
  return nodes;
}

function renderTextBlock(text: string, keyBase: string): ReactNode {
  const lines = text.split("\n");
  return lines.map((line, idx) => (
    <Fragment key={`${keyBase}-l${idx}`}>
      {idx > 0 ? <br /> : null}
      {renderInline(line, `${keyBase}-l${idx}`)}
    </Fragment>
  ));
}

export function MarkdownLite({ text }: { text: string }) {
  const parts = splitFences(text);
  return (
    <div className="text-sm leading-relaxed whitespace-pre-wrap break-words">
      {parts.map((part, idx) =>
        part.code ? (
          <pre
            key={`code-${idx}`}
            className="my-2 overflow-x-auto rounded-md border border-rule bg-paper-3 p-3 text-[13px] leading-relaxed tnum"
          >
            <code>{part.content}</code>
          </pre>
        ) : (
          <span key={`text-${idx}`}>{renderTextBlock(part.content, `p${idx}`)}</span>
        ),
      )}
    </div>
  );
}
