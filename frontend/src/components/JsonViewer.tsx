import { useState } from "react";

interface JsonViewerProps {
  data: Record<string, unknown>;
}

const PREVIEW_LINES = 30;

export default function JsonViewer({ data }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);
  const lines = json.split("\n");
  const lineCount = lines.length;
  const shouldTruncate = lineCount > PREVIEW_LINES;
  const displayedJson =
    expanded || !shouldTruncate
      ? json
      : lines.slice(0, PREVIEW_LINES).join("\n");

  function copyToClipboard() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    /* Fill parent flex column — no outer card chrome (parent tab panel is the card) */
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#e5e4e2] flex items-center justify-between flex-shrink-0 bg-white">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[#1a1a18]">Raw JSON</span>
          <span className="text-xs text-[#6b6b68] bg-[#f9f9f8] border border-[#e5e4e2] px-2 py-0.5 rounded font-mono">
            {lineCount} lines
          </span>
        </div>
        <button
          onClick={copyToClipboard}
          className={[
            "text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all duration-200 border",
            copied
              ? "bg-[#059669]/10 text-[#059669] border-[#059669]/20"
              : "bg-[#f9f9f8] text-[#6b6b68] border-[#e5e4e2] hover:border-[#f05742]/30 hover:text-[#f05742]",
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
                  d="M5 13l4 4L19 7"
                />
              </svg>
              Copied!
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
                  d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
              Copy JSON
            </>
          )}
        </button>
      </div>

      {/* Scrollable JSON area — fills all remaining height */}
      <div className="relative flex-1 min-h-0 overflow-auto bg-[#f9f9f8]">
        <pre className="text-xs leading-relaxed p-5 font-mono text-[#1a1a18] min-w-max">
          {displayedJson}
        </pre>
        {/* Fade gradient when truncated */}
        {shouldTruncate && !expanded && (
          <div className="sticky bottom-0 inset-x-0 h-10 bg-gradient-to-t from-[#f9f9f8] to-transparent pointer-events-none" />
        )}
      </div>

      {/* Footer — show more / show less */}
      {shouldTruncate && (
        <div className="flex-shrink-0 px-5 py-2.5 border-t border-[#e5e4e2] bg-white flex items-center justify-between">
          <span className="text-xs text-[#6b6b68]">
            {expanded
              ? `Showing all ${lineCount} lines`
              : `Showing ${PREVIEW_LINES} of ${lineCount} lines`}
          </span>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs font-medium text-[#f05742] hover:text-[#d94332] transition-colors"
          >
            {expanded ? "Show less ↑" : "Show all ↓"}
          </button>
        </div>
      )}
    </div>
  );
}
