export default function LoadingState() {
  return (
    <div className="space-y-5">
      {/* Status card */}
      <div className="bg-white border border-[#e5e4e2] rounded-xl px-6 py-10 shadow-sm text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#f05742]/10 flex items-center justify-center mb-4">
          <svg
            className="w-7 h-7 text-[#f05742] animate-spin"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-[#1a1a18]">
          Analyzing document…
        </h3>
        <p className="mt-2 text-sm text-[#6b6b68] max-w-xs mx-auto">
          Sending to Azure Content Understanding. This may take a few seconds.
        </p>
      </div>

      {/* Skeleton metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white border border-[#e5e4e2] rounded-xl px-5 py-4 shadow-sm animate-pulse"
          >
            <div className="h-3 w-20 bg-[#e5e4e2] rounded mb-3" />
            <div className="h-7 w-16 bg-[#e5e4e2] rounded mb-2" />
            <div className="h-2 w-12 bg-[#e5e4e2] rounded" />
          </div>
        ))}
      </div>

      {/* Skeleton table */}
      <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden animate-pulse">
        <div className="px-5 py-3.5 border-b border-[#e5e4e2]">
          <div className="h-4 w-32 bg-[#e5e4e2] rounded" />
        </div>
        <div className="divide-y divide-[#e5e4e2]">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="px-5 py-3 flex items-center gap-4">
              <div className="h-3 w-24 bg-[#f05742]/10 rounded flex-shrink-0" />
              <div className="h-3 flex-1 bg-[#e5e4e2] rounded" />
              <div className="h-5 w-12 bg-[#e5e4e2] rounded flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
