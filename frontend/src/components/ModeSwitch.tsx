export type Mode = "standard" | "pro";

interface ModeSwitchProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
}

export default function ModeSwitch({ mode, onChange }: ModeSwitchProps) {
  return (
    <div className="flex justify-center">
      <div
        className="relative inline-grid grid-cols-2 bg-white border border-[#e5e4e2] rounded-full p-1 shadow-sm select-none"
        role="radiogroup"
        aria-label="Analysis mode"
      >
        {/* Animated highlight pill — slides via CSS left/right transitions */}
        <span
          aria-hidden="true"
          className="absolute inset-y-1 rounded-full bg-[#f05742] shadow-sm pointer-events-none"
          style={{
            transition:
              "left 0.28s cubic-bezier(0.4,0,0.2,1), right 0.28s cubic-bezier(0.4,0,0.2,1)",
            left: mode === "standard" ? "4px" : "50%",
            right: mode === "standard" ? "50%" : "4px",
          }}
        />

        <button
          role="radio"
          aria-checked={mode === "standard"}
          onClick={() => onChange("standard")}
          className={[
            "relative z-10 px-6 py-2 text-sm font-medium rounded-full transition-colors duration-200",
            mode === "standard"
              ? "text-white"
              : "text-[#6b6b68] hover:text-[#1a1a18]",
          ].join(" ")}
        >
          Standard
        </button>

        <button
          role="radio"
          aria-checked={mode === "pro"}
          onClick={() => onChange("pro")}
          className={[
            "relative z-10 px-6 py-2 text-sm font-medium rounded-full transition-colors duration-200 flex items-center justify-center gap-1.5",
            mode === "pro"
              ? "text-white"
              : "text-[#6b6b68] hover:text-[#1a1a18]",
          ].join(" ")}
        >
          {/* Lightning bolt icon */}
          <svg
            className="w-3.5 h-3.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
          Pro Mode
        </button>
      </div>
    </div>
  );
}
