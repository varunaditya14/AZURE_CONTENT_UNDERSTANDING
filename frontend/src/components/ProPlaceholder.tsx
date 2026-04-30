export default function ProPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-8 rounded-2xl border-2 border-dashed border-[#f05742]/30 bg-[#f05742]/[0.03]">
      {/* Icon badge */}
      <div className="w-12 h-12 rounded-xl bg-[#f05742]/10 flex items-center justify-center mb-4">
        <svg
          className="w-6 h-6 text-[#f05742]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 10V3L4 14h7v7l9-11h-7z"
          />
        </svg>
      </div>

      <h3 className="text-base font-semibold text-[#1a1a18] mb-1.5">
        Pro Mode
      </h3>
      <p className="text-sm text-[#6b6b68]">
        Pro Mode configuration will appear here.
      </p>
    </div>
  );
}
