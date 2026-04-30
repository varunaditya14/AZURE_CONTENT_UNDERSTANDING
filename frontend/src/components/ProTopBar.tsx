interface ProTopBarProps {
  activeSchemaName: string;
  onAnalyzerListOpen: () => void;
  onRunAnalysis: () => void;
  running?: boolean;
  runDisabled?: boolean;
  onBuildAnalyzer?: () => void;
  building?: boolean;
  buildDisabled?: boolean;
  /** Override the default "Build analyzer" label (e.g. "New analyzer"). */
  buildLabel?: string;
}

export default function ProTopBar({
  activeSchemaName,
  onAnalyzerListOpen,
  onRunAnalysis,
  running = false,
  runDisabled = false,
  onBuildAnalyzer,
  building = false,
  buildDisabled = false,
  buildLabel = "Build analyzer",
}: ProTopBarProps) {
  return (
    <div className="flex flex-col gap-3 flex-shrink-0">
      {/* Row 1 — title + breadcrumb + list link */}
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold text-[#1a1a18] tracking-tight flex-shrink-0">
          Test analyzer
        </h2>

        {/* Chevron separator */}
        <svg
          className="w-3.5 h-3.5 text-[#d1d0ce] flex-shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>

        {/* Active schema name */}
        <span className="text-sm font-medium text-[#6b6b68] max-w-[200px] truncate">
          {activeSchemaName}
        </span>

        <button
          onClick={onAnalyzerListOpen}
          className="ml-2 flex items-center gap-1.5 text-sm text-[#6b6b68] hover:text-[#f05742] transition-colors duration-150 flex-shrink-0"
        >
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
              d="M4 6h16M4 10h16M4 14h16M4 18h16"
            />
          </svg>
          Analyzer list
        </button>
      </div>

      {/* Row 2 — action bar */}
      <div className="h-14 flex items-center gap-3 bg-[#f9f9f8] border border-[#e5e4e2] rounded-2xl px-4">
        {/* Run analysis — primary */}
        <button
          onClick={onRunAnalysis}
          disabled={running || runDisabled}
          className="h-9 px-4 flex items-center gap-2 bg-[#f05742] hover:bg-[#d94332] active:bg-[#c23a2b] disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors shadow-sm select-none"
        >
          {running ? (
            <svg
              className="w-3.5 h-3.5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path d="M6 4l14 8-14 8V4z" />
            </svg>
          )}
          {running ? "Running…" : "Run analysis"}
        </button>

        {/* Build analyzer — secondary */}
        <button
          onClick={onBuildAnalyzer}
          disabled={building || buildDisabled || !onBuildAnalyzer}
          className="h-9 px-4 flex items-center gap-2 bg-white hover:bg-[#f9f9f8] border border-[#e5e4e2] hover:border-[#d1d0ce] text-[#1a1a18] text-sm font-medium rounded-xl transition-colors select-none disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {building ? (
            <svg
              className="w-3.5 h-3.5 animate-spin text-[#6b6b68]"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8H4z"
              />
            </svg>
          ) : (
            <svg
              className="w-3.5 h-3.5 text-[#6b6b68]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
          )}
          {building ? "Building…" : buildLabel}
        </button>
      </div>
    </div>
  );
}
