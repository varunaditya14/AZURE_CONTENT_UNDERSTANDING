import { useState, useEffect } from "react";
import type { AnalyzerSchema, SchemaStatus } from "../types/proTypes";

interface Props {
  schema: AnalyzerSchema;
  onSave: (
    patch: Pick<AnalyzerSchema, "name" | "description" | "status">,
  ) => void;
  onClose: () => void;
}

export default function ProSchemaSettingsModal({
  schema,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(schema.name);
  const [description, setDescription] = useState(schema.description);
  const [status, setStatus] = useState<SchemaStatus>(schema.status);
  const [nameError, setNameError] = useState("");

  // Escape to close
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  function handleSave() {
    if (!name.trim()) {
      setNameError("Schema name is required.");
      return;
    }
    onSave({ name: name.trim(), description, status });
    onClose();
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={handleBackdrop}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl border border-[#e5e4e2] flex flex-col"
        style={{ width: 560, maxWidth: "calc(100vw - 32px)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="schema-settings-title"
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#e5e4e2]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f05742]/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-4 h-4 text-[#f05742]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
            <div>
              <h3
                id="schema-settings-title"
                className="text-base font-bold text-[#1a1a18]"
              >
                Schema settings
              </h3>
              <p className="text-xs text-[#6b6b68] mt-0.5 truncate max-w-[300px]">
                {schema.name}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b68] hover:text-[#1a1a18] hover:bg-[#f5f5f4] transition-colors"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-5 px-6 py-6">
          {/* Schema name */}
          <div>
            <label className="block text-xs font-semibold text-[#1a1a18] mb-1.5">
              Schema name <span className="text-[#dc2626]">*</span>
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              className={[
                "w-full h-10 px-3 rounded-xl border text-sm text-[#1a1a18] bg-white outline-none transition-colors",
                nameError
                  ? "border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/15"
                  : "border-[#e5e4e2] focus:border-[#f05742] focus:ring-2 focus:ring-[#f05742]/15",
              ].join(" ")}
            />
            {nameError && (
              <p className="mt-1 text-xs text-[#dc2626]">{nameError}</p>
            )}
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-[#1a1a18] mb-1.5">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Describe what this analyzer extracts…"
              className="w-full px-3 py-2.5 rounded-xl border border-[#e5e4e2] text-sm text-[#1a1a18] bg-white outline-none focus:border-[#f05742] focus:ring-2 focus:ring-[#f05742]/15 transition-colors resize-none"
            />
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-[#1a1a18] mb-2">
              Status
            </label>
            <div className="flex gap-3">
              {(["draft", "saved"] as SchemaStatus[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setStatus(s)}
                  className={[
                    "flex-1 h-9 rounded-xl border text-sm font-medium transition-colors",
                    status === s
                      ? "border-[#f05742] bg-[#fff5f4] text-[#f05742]"
                      : "border-[#e5e4e2] text-[#6b6b68] hover:border-[#f05742]/40 hover:text-[#1a1a18] bg-white",
                  ].join(" ")}
                >
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Footer ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#e5e4e2]">
          <button
            onClick={onClose}
            className="h-9 px-5 rounded-xl border border-[#e5e4e2] text-sm font-medium text-[#1a1a18] hover:bg-[#f9f9f8] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 rounded-xl bg-[#f05742] hover:bg-[#d94332] text-white text-sm font-semibold transition-colors shadow-sm"
          >
            Save settings
          </button>
        </div>
      </div>
    </div>
  );
}
