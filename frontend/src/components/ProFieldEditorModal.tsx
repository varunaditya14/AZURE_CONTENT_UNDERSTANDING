import { useState, useEffect, useRef } from "react";
import type { SchemaField, ValueType, FieldMethod } from "../types/proTypes";
import { VALUE_TYPES, FIELD_METHODS } from "../types/proTypes";

interface Props {
  /** Pass null/undefined to open in Add mode; pass a field to open in Edit mode. */
  initial: SchemaField | null | undefined;
  onSave: (data: Omit<SchemaField, "id">) => void;
  onClose: () => void;
}

// Reusable label component
function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block text-xs font-semibold text-[#1a1a18] mb-1.5">
      {children}
      {required && <span className="text-[#dc2626] ml-0.5">*</span>}
    </label>
  );
}

export default function ProFieldEditorModal({
  initial,
  onSave,
  onClose,
}: Props) {
  const isEdit = initial != null;

  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [valueType, setValueType] = useState<ValueType>(
    initial?.valueType ?? "String",
  );
  const [method, setMethod] = useState<FieldMethod>(
    initial?.method ?? "Extract",
  );
  const [nameError, setNameError] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  // Auto-focus name field
  useEffect(() => {
    nameRef.current?.focus();
  }, []);

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
      setNameError("Field name is required.");
      nameRef.current?.focus();
      return;
    }
    // Azure CU field names must match ^[a-zA-Z][a-zA-Z0-9_]*$
    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name.trim())) {
      setNameError(
        "Field name must start with a letter and contain only letters, numbers, or underscores (no spaces).",
      );
      nameRef.current?.focus();
      return;
    }
    onSave({ name: name.trim(), description, valueType, method });
    onClose();
  }

  function handleBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose();
  }

  const inputCls = (hasError: boolean) =>
    [
      "w-full h-10 px-3 rounded-xl border text-sm text-[#1a1a18] bg-white outline-none transition-colors",
      hasError
        ? "border-[#dc2626] focus:ring-2 focus:ring-[#dc2626]/15"
        : "border-[#e5e4e2] focus:border-[#f05742] focus:ring-2 focus:ring-[#f05742]/15",
    ].join(" ");

  const selectCls =
    "w-full h-10 px-3 rounded-xl border border-[#e5e4e2] text-sm text-[#1a1a18] bg-white outline-none focus:border-[#f05742] focus:ring-2 focus:ring-[#f05742]/15 transition-colors cursor-pointer appearance-none";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={handleBackdrop}
    >
      <div
        className="bg-white rounded-[20px] shadow-2xl border border-[#e5e4e2] flex flex-col"
        style={{ width: 600, maxWidth: "calc(100vw - 32px)" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="field-modal-title"
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
                {isEdit ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                )}
              </svg>
            </div>
            <div>
              <h3
                id="field-modal-title"
                className="text-base font-bold text-[#1a1a18]"
              >
                {isEdit ? "Edit field" : "Add new field"}
              </h3>
              {isEdit && (
                <p className="text-xs text-[#6b6b68] mt-0.5">
                  Editing <span className="font-semibold">{initial.name}</span>
                </p>
              )}
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
          {/* Field name */}
          <div>
            <FieldLabel required>Field name</FieldLabel>
            <input
              ref={nameRef}
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (nameError) setNameError("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              placeholder="e.g. purchaseOrderNumber or invoice_total"
              className={inputCls(!!nameError)}
            />
            {nameError ? (
              <p className="mt-1 text-xs text-[#dc2626]">{nameError}</p>
            ) : (
              <p className="mt-1 text-xs text-[#6b6b68]">
                Start with a letter; use only letters, numbers, underscores — no
                spaces.
              </p>
            )}
          </div>

          {/* Field description */}
          <div>
            <FieldLabel>Field description</FieldLabel>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of what this field captures"
              className={inputCls(false)}
            />
          </div>

          {/* Value type + Method (2 columns) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <FieldLabel>Value type</FieldLabel>
              <div className="relative">
                <select
                  value={valueType}
                  onChange={(e) => setValueType(e.target.value as ValueType)}
                  className={selectCls}
                >
                  {VALUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                {/* Custom chevron */}
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b6b68]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
            </div>

            <div>
              <FieldLabel>Method</FieldLabel>
              <div className="relative">
                <select
                  value={method}
                  onChange={(e) => setMethod(e.target.value as FieldMethod)}
                  className={selectCls}
                >
                  {FIELD_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <svg
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#6b6b68]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </div>
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
            {isEdit ? "Save changes" : "Add field"}
          </button>
        </div>
      </div>
    </div>
  );
}
