import { useState } from "react";

interface JsonViewerProps {
  data: Record<string, unknown>;
}

export default function JsonViewer({ data }: JsonViewerProps) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const json = JSON.stringify(data, null, 2);
  const lineCount = json.split("\n").length;
  const preview = json.split("\n").slice(0, 10).join("\n");
  const shouldTruncate = lineCount > 10;

  function copyToClipboard() {
    navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <h3 className="text-sm font-semibold text-[#1a1a18]">
            Raw JSON Result
          </h3>
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
      <div className="relative">
        <pre className="text-xs leading-relaxed p-5 overflow-x-auto text-[#1a1a18] bg-[#f9f9f8] font-mono">
          {expanded || !shouldTruncate ? json : preview}
        </pre>
        {shouldTruncate && !expanded && (
          <div className="absolute bottom-0 inset-x-0 h-16 bg-gradient-to-t from-[#f9f9f8] to-transparent pointer-events-none" />
        )}
      </div>
      {shouldTruncate && (
        <div className="px-5 py-3 border-t border-[#e5e4e2] text-center">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-sm text-[#f05742] hover:text-[#d94332] font-medium transition-colors"
          >
            {expanded ? "Show less ↑" : `Show all ${lineCount} lines ↓`}
          </button>
        </div>
      )}
    </div>
  );
}
