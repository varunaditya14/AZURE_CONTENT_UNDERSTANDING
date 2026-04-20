import { useEffect, useMemo, useState } from "react";
import type { FieldResult } from "../types/analysis";

// ---------------------------------------------------------------------------
// Field-name parsing and grouping
// ---------------------------------------------------------------------------

type ParsedField =
  | { kind: "scalar" }
  | { kind: "array-item"; group: string; idx: number; subKey?: string };

/**
 * Detect whether a field name encodes an array item.
 *   "Topics[0]"       → group="Topics", idx=0, subKey=undefined
 *   "People[1].Name"  → group="People", idx=1, subKey="Name"
 *   "Summary"         → scalar
 */
function parseFieldName(name: string): ParsedField {
  const m = name.match(/^([^\[.]+)\[(\d+)\](?:\.(.+))?$/);
  if (m) {
    return {
      kind: "array-item",
      group: m[1],
      idx: parseInt(m[2], 10),
      subKey: m[3],
    };
  }
  return { kind: "scalar" };
}

interface ArrayItemEntry {
  subKey: string | undefined;
  field: FieldResult;
}

interface ArrayItemGroup {
  idx: number;
  entries: ArrayItemEntry[];
}

interface GroupedScalar {
  kind: "scalar";
  field: FieldResult;
}

interface GroupedArray {
  kind: "array";
  name: string;
  items: ArrayItemGroup[];
}

type RenderGroup = GroupedScalar | GroupedArray;

/**
 * Merge a flat FieldResult[] into RenderGroup[], preserving first-seen
 * order. Array items with the same group name are coalesced into one card.
 */
function groupFields(fields: FieldResult[]): RenderGroup[] {
  const result: RenderGroup[] = [];
  const arrayPos = new Map<string, number>(); // group name → index in result[]

  for (const field of fields) {
    const parsed = parseFieldName(field.name);

    if (parsed.kind === "scalar") {
      result.push({ kind: "scalar", field });
      continue;
    }

    const { group, idx, subKey } = parsed;

    if (!arrayPos.has(group)) {
      arrayPos.set(group, result.length);
      result.push({ kind: "array", name: group, items: [] });
    }

    const g = result[arrayPos.get(group)!] as GroupedArray;
    let item = g.items.find((i) => i.idx === idx);
    if (!item) {
      item = { idx, entries: [] };
      g.items.push(item);
    }
    item.entries.push({ subKey, field });
  }

  // Sort items within each array group by index
  for (const g of result) {
    if (g.kind === "array") {
      g.items.sort((a, b) => a.idx - b.idx);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Field priority ordering
// ---------------------------------------------------------------------------

/**
 * Return a numeric priority for a field / group name.
 * Lower = higher visual priority (shown first).
 * Surfaces high-signal fields (summary, topics, people) above raw timing or
 * metadata fields, regardless of the analyzer that produced the result.
 */
function fieldPriorityScore(name: string): number {
  const n = name.toLowerCase();
  if (/summary|abstract|overview|brief|description/.test(n)) return 1;
  if (/topic|subject|theme|keyword|tag/.test(n)) return 2;
  if (/person|people|speaker|actor|participant|attendee|guest/.test(n))
    return 3;
  if (/compan|organiz|org\b|entity|entities|brand|product/.test(n)) return 4;
  if (/sentiment|emotion|categor|classif|label|mood|tone/.test(n)) return 5;
  if (/segment|event|scene|highlight|key|chapter|section/.test(n)) return 6;
  // Pure timing / offset fields — de-emphasise but still show
  if (/^(starttime|endtime|startoffset|endoffset|duration)$/i.test(n)) return 9;
  if (/^(start|end|offset|duration|timestamp|time)s?$/i.test(n)) return 9;
  return 7; // everything else keeps natural insertion order
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface FieldsTableProps {
  fields: FieldResult[];
  selectedFieldName?: string | null;
  onFieldSelect?: (name: string | null) => void;
  onFieldHover?: (name: string | null) => void;
  groundedFieldNames?: Set<string>;
}

// ---------------------------------------------------------------------------
// Confidence badge
// ---------------------------------------------------------------------------

function ConfidenceBadge({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="text-xs text-[#9b9b98]">—</span>;
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

// ---------------------------------------------------------------------------
// Scalar row
// ---------------------------------------------------------------------------

function ScalarRow({
  field,
  isSelected,
  isGrounded,
  showConfidenceCol,
  onSelect,
  onHover,
}: {
  field: FieldResult;
  isSelected: boolean;
  isGrounded: boolean;
  showConfidenceCol: boolean;
  onSelect?: (name: string | null) => void;
  onHover?: (name: string | null) => void;
}) {
  const pct =
    field.confidence !== null ? Math.round(field.confidence * 100) : null;

  let leftBorder = "border-l-[3px] border-l-transparent";
  if (isSelected) {
    leftBorder = "border-l-[3px] border-l-[#f05742]";
  } else if (pct !== null) {
    if (pct >= 80) leftBorder = "border-l-[3px] border-l-[#059669]";
    else if (pct >= 50) leftBorder = "border-l-[3px] border-l-[#d97706]";
    else leftBorder = "border-l-[3px] border-l-[#dc2626]";
  }

  return (
    <tr
      data-field-name={field.name}
      className={`transition-colors ${
        isSelected ? "bg-[#f05742]/5" : "hover:bg-[#f9f9f8]"
      } ${onSelect ? "cursor-pointer" : ""}`}
      onClick={() => onSelect?.(isSelected ? null : field.name)}
      onMouseEnter={() => onHover?.(field.name)}
      onMouseLeave={() => onHover?.(null)}
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
          <span className="text-[#6b6b68] italic text-xs">null</span>
        )}
        {field.source != null && (
          <p className="text-xs text-[#6b6b68] mt-0.5 truncate">
            {field.source}
          </p>
        )}
      </td>
      {showConfidenceCol && (
        <td className="px-5 py-3 pt-3.5 text-right align-top">
          <ConfidenceBadge value={field.confidence} />
        </td>
      )}
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Array group card
// ---------------------------------------------------------------------------

function ArrayGroupCard({
  group,
  selectedFieldName,
  groundedFieldNames,
  showConfidence,
  onFieldSelect,
  onFieldHover,
}: {
  group: GroupedArray;
  selectedFieldName?: string | null;
  groundedFieldNames?: Set<string>;
  showConfidence: boolean;
  onFieldSelect?: (name: string | null) => void;
  onFieldHover?: (name: string | null) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  // Simple array: every item is a single entry with no sub-key
  const isSimple = group.items.every(
    (item) => item.entries.length === 1 && item.entries[0].subKey === undefined,
  );

  return (
    <div className="border-b border-[#e5e4e2] last:border-b-0">
      {/* Group header / toggle */}
      <button
        type="button"
        className="w-full flex items-center gap-2 px-5 py-3 hover:bg-[#f9f9f8] transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <svg
          className={`w-3 h-3 text-[#9b9b98] flex-shrink-0 transition-transform duration-150 ${
            expanded ? "rotate-90" : ""
          }`}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M8.59 16.58L13.17 12 8.59 7.41 10 6l6 6-6 6z" />
        </svg>
        <span className="font-mono text-xs font-semibold text-[#f05742]">
          {group.name}
        </span>
        <span className="ml-auto text-[11px] text-[#9b9b98] tabular-nums">
          {group.items.length} item{group.items.length !== 1 ? "s" : ""}
        </span>
      </button>

      {expanded &&
        (isSimple ? (
          /* Chip / tag list for simple string arrays */
          <div className="px-5 pb-4 flex flex-wrap gap-1.5">
            {group.items.map((item) => {
              const entry = item.entries[0];
              const fieldName = `${group.name}[${item.idx}]`;
              const isSelected = selectedFieldName === fieldName;
              return (
                <button
                  key={item.idx}
                  type="button"
                  data-field-name={fieldName}
                  title={entry.field.value ?? "null"}
                  onClick={() => onFieldSelect?.(isSelected ? null : fieldName)}
                  onMouseEnter={() => onFieldHover?.(fieldName)}
                  onMouseLeave={() => onFieldHover?.(null)}
                  className={[
                    "inline-flex items-center px-2.5 py-1 rounded-md text-sm transition-colors",
                    isSelected
                      ? "bg-[#f05742]/10 border border-[#f05742]/30 text-[#f05742] font-medium"
                      : "bg-[#f9f9f8] border border-[#e5e4e2] text-[#1a1a18] hover:border-[#f05742]/25 hover:bg-[#f05742]/5",
                    onFieldSelect ? "cursor-pointer" : "cursor-default",
                  ].join(" ")}
                >
                  {entry.field.value ?? (
                    <em className="not-italic text-[#9b9b98] text-xs">null</em>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          /* Item cards for object arrays (with sub-keys) */
          <div className="px-4 pb-4 space-y-2">
            {group.items.map((item) => (
              <div
                key={item.idx}
                className="rounded-lg border border-[#e5e4e2] bg-[#f9f9f8] overflow-hidden"
              >
                <div className="px-3 py-1.5 border-b border-[#e5e4e2] bg-white">
                  <span className="text-[10px] font-semibold text-[#9b9b98] uppercase tracking-wide">
                    #{item.idx + 1}
                  </span>
                </div>
                <div className="divide-y divide-[#e5e4e2]">
                  {item.entries.map((e) => {
                    const fieldName = `${group.name}[${item.idx}]${
                      e.subKey ? `.${e.subKey}` : ""
                    }`;
                    const isSelected = selectedFieldName === fieldName;
                    const isGrounded =
                      groundedFieldNames?.has(fieldName) ?? false;
                    return (
                      <button
                        key={e.subKey ?? "__value"}
                        type="button"
                        data-field-name={fieldName}
                        className={[
                          "w-full flex items-start gap-3 px-3 py-2.5 text-left transition-colors",
                          isSelected ? "bg-[#f05742]/8" : "hover:bg-white/80",
                          onFieldSelect ? "cursor-pointer" : "cursor-default",
                        ].join(" ")}
                        onClick={() =>
                          onFieldSelect?.(isSelected ? null : fieldName)
                        }
                        onMouseEnter={() => onFieldHover?.(fieldName)}
                        onMouseLeave={() => onFieldHover?.(null)}
                      >
                        {e.subKey && (
                          <span className="font-mono text-[11px] text-[#6b6b68] flex-shrink-0 mt-px w-24 truncate">
                            {e.subKey}
                            {isGrounded && (
                              <span
                                className="inline-block w-1.5 h-1.5 rounded-full bg-[#f05742] ml-1 align-middle"
                                title="Bounding region available"
                              />
                            )}
                          </span>
                        )}
                        <span className="flex-1 text-sm text-[#1a1a18] break-words min-w-0">
                          {e.field.value ?? (
                            <em className="not-italic text-[#9b9b98] text-xs">
                              null
                            </em>
                          )}
                        </span>
                        {showConfidence && e.field.confidence !== null && (
                          <span className="ml-2 flex-shrink-0">
                            <ConfidenceBadge value={e.field.confidence} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyState() {
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
      <p className="text-sm font-medium text-[#1a1a18]">No fields extracted</p>
      <p className="text-xs text-[#6b6b68] mt-1">
        The analyzer did not return any structured fields for this file.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export default function FieldsTable({
  fields,
  selectedFieldName,
  onFieldSelect,
  onFieldHover,
  groundedFieldNames,
}: FieldsTableProps) {
  // Scroll selected field into view
  useEffect(() => {
    if (!selectedFieldName) return;
    const escaped = CSS.escape(selectedFieldName);
    const el = document.querySelector<HTMLElement>(
      `[data-field-name="${escaped}"]`,
    );
    el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedFieldName]);

  const groups = useMemo(() => {
    const raw = groupFields(fields);
    // Stable sort by semantic priority; equal-priority groups preserve
    // their original insertion order via the index tiebreak.
    return raw
      .map((g, i) => ({ g, i }))
      .sort((a, b) => {
        const nameA = a.g.kind === "array" ? a.g.name : a.g.field.name;
        const nameB = b.g.kind === "array" ? b.g.name : b.g.field.name;
        const diff = fieldPriorityScore(nameA) - fieldPriorityScore(nameB);
        return diff !== 0 ? diff : a.i - b.i;
      })
      .map(({ g }) => g);
  }, [fields]);

  if (groups.length === 0) {
    return <EmptyState />;
  }

  const hasScalars = groups.some((g) => g.kind === "scalar");
  const hasArrays = groups.some((g) => g.kind === "array");

  // Only show the confidence column when at least one field actually has a value
  const showScalarConfidence = groups.some(
    (g) => g.kind === "scalar" && g.field.confidence !== null,
  );
  const showArrayConfidence = groups.some(
    (g) =>
      g.kind === "array" &&
      g.items.some((item) =>
        item.entries.some((e) => e.field.confidence !== null),
      ),
  );

  return (
    <div className="h-full flex flex-col bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden">
      {/* Panel header */}
      <div className="px-5 py-3.5 border-b border-[#e5e4e2] flex items-center justify-between flex-shrink-0">
        <h3 className="text-sm font-semibold text-[#1a1a18]">
          Extracted Fields
        </h3>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#f05742] bg-[#f05742]/10 border border-[#f05742]/20 px-2.5 py-0.5 rounded-full">
          {fields.length}
        </span>
      </div>

      {/* Scrollable body */}
      <div className="overflow-auto flex-1 min-h-0">
        {/* Scalar fields — table layout for alignment */}
        {hasScalars && (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#f9f9f8] border-b border-[#e5e4e2] sticky top-0 z-10">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                  Field
                </th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                  Value
                </th>
                {showScalarConfidence && (
                  <th className="text-right px-5 py-2.5 text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
                    Confidence
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#e5e4e2]">
              {groups
                .filter((g): g is GroupedScalar => g.kind === "scalar")
                .map((g, i) => (
                  <ScalarRow
                    key={i}
                    field={g.field}
                    isSelected={selectedFieldName === g.field.name}
                    isGrounded={groundedFieldNames?.has(g.field.name) ?? false}
                    showConfidenceCol={showScalarConfidence}
                    onSelect={onFieldSelect}
                    onHover={onFieldHover}
                  />
                ))}
            </tbody>
          </table>
        )}

        {/* Array group cards */}
        {hasArrays && (
          <div>
            {hasScalars && (
              <div className="px-5 py-2 bg-[#f9f9f8] border-y border-[#e5e4e2]">
                <span className="text-[10px] font-semibold text-[#9b9b98] uppercase tracking-wider">
                  Grouped Fields
                </span>
              </div>
            )}
            {groups
              .filter((g): g is GroupedArray => g.kind === "array")
              .map((g) => (
                <ArrayGroupCard
                  key={g.name}
                  group={g}
                  selectedFieldName={selectedFieldName}
                  groundedFieldNames={groundedFieldNames}
                  showConfidence={showArrayConfidence}
                  onFieldSelect={onFieldSelect}
                  onFieldHover={onFieldHover}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
