import { useEffect } from "react";
import type { FieldResult } from "../types/analysis";

interface FieldsTableProps {
  fields: FieldResult[];
  selectedFieldName?: string | null;
  onFieldSelect?: (name: string | null) => void;
  onFieldHover?: (name: string | null) => void;
  groundedFieldNames?: Set<string>;
}

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-[#6b6b68]">—</span>;
  }
  const pct = Math.round(value * 100);

  let badgeClass = "bg-[#059669]/10 text-[#059669] border-[#059669]/20";
  let barClass = "bg-[#059669]";
  if (pct < 50) {
    badgeClass = "bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/20";
    barClass = "bg-[#dc2626]";
  } else if (pct < 80) {
    badgeClass = "bg-[#d97706]/10 text-[#d97706] border-[#d97706]/20";
    barClass = "bg-[#d97706]";
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <span
        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${badgeClass}`}
      >
        {pct}%
      </span>
      <div className="h-1 w-16 bg-[#e5e4e2] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function FieldsTable({
  fields,
  selectedFieldName,
  onFieldSelect,
  onFieldHover,
  groundedFieldNames,
}: FieldsTableProps) {
  useEffect(() => {
    if (!selectedFieldName) return;
    const escaped = CSS.escape(selectedFieldName);
    const el = document.querySelector<HTMLElement>(
      `[data-field-name="${escaped}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedFieldName]);
  if (fields.length === 0) {
    return (
      <div className="bg-white border border-[#e5e4e2] rounded-xl px-5 py-10 shadow-sm text-center">
        <div className="w-10 h-10 rounded-full bg-[#f05742]/10 flex items-center justify-center mx-auto mb-3 border border-[#f05742]/20">
          <svg
            className="w-5 h-5 text-[#f05742]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
            />
          </svg>
        </div>
        <p className="text-sm font-medium text-[#1a1a18]">
          No fields extracted
        </p>
        <p className="text-xs text-[#6b6b68] mt-1">
          The analyzer did not return any structured fields for this document.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#1a1a18]">
          Extracted Fields
        </h3>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#f05742] bg-[#f05742]/10 border border-[#f05742]/20 px-2.5 py-0.5 rounded-full">
          {fields.length}
        </span>
      </div>
      <div className="overflow-auto flex-1 min-h-0">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#f9f9f8] border-b border-[#e5e4e2] sticky top-0 z-10">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                Field
              </th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                Value
              </th>
              <th className="text-right px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                Confidence
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#e5e4e2]">
            {fields.map((field, i) => {
              const isSelected = selectedFieldName === field.name;
              const isGrounded = groundedFieldNames?.has(field.name) ?? false;
              const rowPct =
                field.confidence !== null
                  ? Math.round(field.confidence * 100)
                  : null;
              let leftBorder = "border-l-[3px] border-l-transparent";
              if (isSelected) {
                leftBorder = "border-l-[3px] border-l-[#f05742]";
              } else if (rowPct !== null) {
                if (rowPct >= 80)
                  leftBorder = "border-l-[3px] border-l-[#059669]";
                else if (rowPct >= 50)
                  leftBorder = "border-l-[3px] border-l-[#d97706]";
                else leftBorder = "border-l-[3px] border-l-[#dc2626]";
              }
              const rowBg = isSelected
                ? "bg-[#f05742]/5"
                : "hover:bg-[#f9f9f8]";
              return (
                <tr
                  key={i}
                  data-field-name={field.name}
                  className={`transition-colors ${rowBg} ${
                    onFieldSelect ? "cursor-pointer" : ""
                  }`}
                  onClick={() =>
                    onFieldSelect?.(isSelected ? null : field.name)
                  }
                  onMouseEnter={() => onFieldHover?.(field.name)}
                  onMouseLeave={() => onFieldHover?.(null)}
                >
                  <td
                    className={`px-5 py-3 pt-3.5 font-mono text-xs text-[#f05742] whitespace-nowrap max-w-[220px] truncate align-top ${leftBorder}`}
                  >
                    {field.name}
                    {isGrounded && (
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-full bg-[#f05742] ml-1.5 mb-0.5 align-middle"
                        title="Bounding region available"
                      />
                    )}
                  </td>
                  <td className="px-5 py-3 pt-3.5 text-[#1a1a18] max-w-sm break-words align-top">
                    {field.value ?? (
                      <span className="text-[#6b6b68] italic text-xs">
                        null
                      </span>
                    )}
                    {field.source != null && (
                      <p className="text-xs text-[#6b6b68] mt-0.5 truncate">
                        {field.source}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3 pt-3.5 text-right align-top">
                    <ConfidenceBadge value={field.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
