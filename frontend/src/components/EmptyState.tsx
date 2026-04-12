export default function EmptyState() {
  return (
    <div className="bg-white border border-dashed border-[#e5e4e2] rounded-2xl px-8 py-16 text-center">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-[#f05742]/10 border border-[#f05742]/20 flex items-center justify-center mb-5">
        <svg
          className="w-8 h-8 text-[#f05742]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
          />
        </svg>
      </div>
      <h3 className="text-base font-semibold text-[#1a1a18]">
        Ready to analyze
      </h3>
      <p className="mt-2 text-sm text-[#6b6b68] max-w-sm mx-auto leading-relaxed">
        Upload a PDF or image above and click{" "}
        <span className="font-semibold text-[#f05742]">Analyze</span> to extract
        structured fields with Azure Content Understanding.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        {["PDF Documents", "JPEG / PNG", "TIFF / BMP", "WebP"].map((label) => (
          <span
            key={label}
            className="text-xs text-[#6b6b68] bg-[#f9f9f8] border border-[#e5e4e2] rounded-full px-3 py-1"
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
