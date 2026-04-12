interface MetricsBarProps {
  latencyMs: number;
  fieldCount: number;
  averageConfidence: number | null;
}

function ClockIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

function ListIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
      />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg
      className="w-4 h-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.8}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    </svg>
  );
}

export default function MetricsBar({
  latencyMs,
  fieldCount,
  averageConfidence,
}: MetricsBarProps) {
  const confPct =
    averageConfidence !== null ? Math.round(averageConfidence * 100) : null;

  let confColor = "#1a1a18";
  let confBarColor = "bg-[#1a1a18]/30";
  if (confPct !== null) {
    if (confPct >= 80) {
      confColor = "#059669";
      confBarColor = "bg-[#059669]";
    } else if (confPct >= 50) {
      confColor = "#d97706";
      confBarColor = "bg-[#d97706]";
    } else {
      confColor = "#dc2626";
      confBarColor = "bg-[#dc2626]";
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Latency */}
      <div className="bg-white border border-[#e5e4e2] rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-[#6b6b68] mb-3">
          <ClockIcon />
          <p className="text-xs uppercase tracking-wide font-medium">Latency</p>
        </div>
        <p className="text-2xl font-bold text-[#1a1a18] leading-none">
          {latencyMs.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          <span className="text-sm font-normal text-[#6b6b68] ml-1">ms</span>
        </p>
        <p className="text-xs text-[#6b6b68] mt-1.5">end-to-end</p>
      </div>

      {/* Fields extracted */}
      <div className="bg-white border border-[#e5e4e2] rounded-xl px-5 py-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-[#f05742] mb-3">
          <ListIcon />
          <p className="text-xs uppercase tracking-wide font-medium">
            Fields Extracted
          </p>
        </div>
        <p className="text-2xl font-bold text-[#f05742] leading-none">
          {fieldCount}
        </p>
        <p className="text-xs text-[#6b6b68] mt-1.5">total fields</p>
      </div>

      {/* Average confidence */}
      <div className="bg-white border border-[#e5e4e2] rounded-xl px-5 py-4 shadow-sm">
        <div
          className="flex items-center gap-1.5 mb-3"
          style={{ color: confPct !== null ? confColor : "#6b6b68" }}
        >
          <CheckCircleIcon />
          <p className="text-xs uppercase tracking-wide font-medium text-[#6b6b68]">
            Avg. Confidence
          </p>
        </div>
        <p
          className="text-2xl font-bold leading-none"
          style={{ color: confPct !== null ? confColor : "#1a1a18" }}
        >
          {confPct !== null ? `${confPct}%` : "—"}
        </p>
        {confPct !== null ? (
          <div className="mt-2.5">
            <div className="h-1.5 w-full bg-[#e5e4e2] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${confBarColor}`}
                style={{ width: `${confPct}%` }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#6b6b68] mt-1.5">across all fields</p>
        )}
      </div>
    </div>
  );
}
