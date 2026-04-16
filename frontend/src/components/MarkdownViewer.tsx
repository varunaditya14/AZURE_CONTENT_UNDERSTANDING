import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";

// Extend default sanitize schema to preserve table alignment attributes from Azure CU HTML
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    td: [...(defaultSchema.attributes?.["td"] ?? []), "align"],
    th: [...(defaultSchema.attributes?.["th"] ?? []), "align"],
  },
};

/** Image with graceful fallback when the src URL is unresolvable (e.g. Azure figure references). */
function SafeImage({ src, alt }: { src?: string; alt?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-[#9b9b97] bg-[#f3f3f1] px-2 py-1 rounded border border-[#e5e4e2]">
        <svg
          className="w-3.5 h-3.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 18h16.5M4.5 4.5h15A2.25 2.25 0 0 1 21.75 6.75v10.5A2.25 2.25 0 0 1 19.5 19.5h-15a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 4.5 4.5Z"
          />
        </svg>
        {alt ? alt : "Figure"}
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt ?? ""}
      className="max-w-full my-2 rounded-md border border-[#e5e4e2]"
      onError={() => setFailed(true)}
    />
  );
}

/** Pattern that identifies Azure CU internal figure references, e.g. figures/1.1 */
const AZURE_FIGURE_RE = /^figures\//i;

/**
 * Build the react-markdown component map. Accepts figureMap so the `img`
 * renderer can resolve Azure figure refs to data-URIs (or hide them silently).
 */
function makeMdComponents(figureMap: Map<string, string>): Components {
  return {
    h1: ({ children }) => (
      <h1 className="text-2xl font-bold text-[#1a1a18] mt-6 mb-3 pb-2 border-b border-[#e5e4e2] first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="text-xl font-semibold text-[#1a1a18] mt-5 mb-2 first:mt-0">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base font-semibold text-[#1a1a18] mt-4 mb-1.5 first:mt-0">
        {children}
      </h3>
    ),
    h4: ({ children }) => (
      <h4 className="text-sm font-semibold text-[#2d2d2b] mt-3 mb-1 first:mt-0">
        {children}
      </h4>
    ),
    h5: ({ children }) => (
      <h5 className="text-sm font-medium text-[#2d2d2b] mt-3 mb-1 first:mt-0">
        {children}
      </h5>
    ),
    h6: ({ children }) => (
      <h6 className="text-xs font-medium text-[#6b6b68] uppercase tracking-wide mt-3 mb-1 first:mt-0">
        {children}
      </h6>
    ),
    p: ({ children }) => (
      <p className="text-sm text-[#2d2d2b] leading-relaxed mb-3 last:mb-0">
        {children}
      </p>
    ),
    a: ({ href, children }) => (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-[#f05742] hover:text-[#d94332] underline underline-offset-2 transition-colors"
      >
        {children}
      </a>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-outside ml-5 mb-3 space-y-0.5 text-sm text-[#2d2d2b]">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-outside ml-5 mb-3 space-y-0.5 text-sm text-[#2d2d2b]">
        {children}
      </ol>
    ),
    li: ({ children }) => (
      <li className="leading-relaxed pl-0.5">{children}</li>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 border-[#e5e4e2] pl-4 italic text-[#6b6b68] my-3">
        {children}
      </blockquote>
    ),
    // Block code (language-* class present) vs inline code (no language class)
    code: ({ className, children }) => {
      const isBlock = /^language-/.test(className ?? "");
      if (isBlock) {
        return <code className={className ?? ""}>{children}</code>;
      }
      return (
        <code className="bg-[#f3f3f1] text-[#d94332] px-1 py-0.5 rounded text-xs font-mono">
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="bg-[#f3f3f1] rounded-md overflow-x-auto my-3 p-3 text-xs font-mono text-[#2d2d2b]">
        {children}
      </pre>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-4 rounded-md border border-[#e5e4e2]">
        <table className="text-sm border-collapse w-full min-w-full">
          {children}
        </table>
      </div>
    ),
    thead: ({ children }) => <thead className="bg-[#f3f3f1]">{children}</thead>,
    tbody: ({ children }) => (
      <tbody className="divide-y divide-[#f0efed]">{children}</tbody>
    ),
    tr: ({ children }) => (
      <tr className="hover:bg-[#fafaf9] transition-colors">{children}</tr>
    ),
    th: ({ children }) => (
      <th className="text-left px-3 py-2 font-medium text-[#1a1a18] text-xs uppercase tracking-wide whitespace-nowrap border-b-2 border-[#d4d3d0]">
        {children}
      </th>
    ),
    td: ({ children }) => (
      <td className="px-3 py-2 text-[#2d2d2b] align-top text-sm border-b border-[#f0efed]">
        {children}
      </td>
    ),
    hr: () => <hr className="border-[#e5e4e2] my-5" />,
    strong: ({ children }) => (
      <strong className="font-semibold text-[#1a1a18]">{children}</strong>
    ),
    em: ({ children }) => <em className="italic">{children}</em>,
    del: ({ children }) => (
      <del className="text-[#9b9b97] line-through">{children}</del>
    ),
    img: ({ src, alt }) => {
      // Azure CU figure refs like figures/1.1 are NOT real URLs.
      // Resolve from figureMap if possible; otherwise hide completely.
      if (src && AZURE_FIGURE_RE.test(src)) {
        const id = src.replace(AZURE_FIGURE_RE, "");
        const dataUri = figureMap.get(id);
        if (!dataUri) return null; // unresolvable — hide silently, no broken UI
        return (
          <img
            src={dataUri}
            alt={alt ?? ""}
            className="max-w-full my-2 rounded-md border border-[#e5e4e2]"
          />
        );
      }
      // Regular URL: use SafeImage for graceful onError fallback
      return <SafeImage src={src} alt={alt} />;
    },
  };
}

interface MarkdownViewerProps {
  markdown: string | null;
  /** Figure map from extractFigureMap — resolves Azure figure refs to data URIs. */
  figureMap?: Map<string, string>;
}

export default function MarkdownViewer({
  markdown,
  figureMap,
}: MarkdownViewerProps) {
  const [copied, setCopied] = useState(false);
  const mdComponents = useMemo(
    () => makeMdComponents(figureMap ?? new Map()),
    [figureMap],
  );

  function handleCopy() {
    if (!markdown) return;
    navigator.clipboard.writeText(markdown).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (!markdown) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="text-center space-y-2">
          <svg
            className="mx-auto w-10 h-10 text-[#d4d3d0]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
            />
          </svg>
          <p className="text-sm text-[#9b9b97]">
            No markdown content available
          </p>
          <p className="text-xs text-[#b8b8b4]">
            The analyzer result did not include structured markdown output.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-[#e5e4e2] flex-shrink-0 bg-[#fafaf9]">
        <span className="text-xs font-medium text-[#9b9b97] uppercase tracking-wide">
          Markdown
        </span>
        <button
          onClick={handleCopy}
          title="Copy markdown"
          className={[
            "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border transition-colors duration-150",
            copied
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "bg-white text-[#6b6b68] border-[#e5e4e2] hover:text-[#1a1a18] hover:border-[#d4d3d0]",
          ].join(" ")}
        >
          {copied ? (
            <>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              Copied
            </>
          ) : (
            <>
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                />
              </svg>
              Copy
            </>
          )}
        </button>
      </div>

      {/* Rendered markdown */}
      <div className="flex-1 overflow-auto px-5 py-4">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema]]}
          components={mdComponents}
        >
          {markdown}
        </ReactMarkdown>
      </div>
    </div>
  );
}
