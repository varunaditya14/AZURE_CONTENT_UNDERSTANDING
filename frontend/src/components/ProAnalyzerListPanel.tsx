import { useEffect, useState } from "react";
import type { RemoteAnalyzerListItem } from "../types/remoteAnalyzer";

interface Props {
  analyzers: RemoteAnalyzerListItem[];
  loading: boolean;
  error: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClose: () => void;
  onReload: () => void;
  onNew?: () => void;
  onDelete?: (id: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const days = Math.floor(diff / 86400000);
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "";
  }
}

type AzureStatus = "ready" | "creating" | "failed" | string;

function StatusBadge({ status }: { status: AzureStatus | null }) {
  const s = (status ?? "").toLowerCase();
  const styles =
    s === "ready"
      ? "bg-[#f0fdf4] text-[#15803d]"
      : s === "creating"
        ? "bg-[#fff7ed] text-[#c2410c]"
        : s === "failed"
          ? "bg-[#fef2f2] text-[#dc2626]"
          : "bg-[#f5f5f4] text-[#6b6b68]";
  const label = s || "unknown";
  return (
    <span
      className={`flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide ${styles}`}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProAnalyzerListPanel({
  analyzers,
  loading,
  error,
  selectedId,
  onSelect,
  onClose,
  onReload,
  onNew,
  onDelete,
}: Props) {
  // Close on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Tracks which analyzer is in the "confirm delete" state (id or null).
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  // Tracks which analyzer is actively being deleted (spinner).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function handleConfirmDelete(id: string) {
    if (!onDelete) return;
    setDeletingId(id);
    setDeleteError(null);
    try {
      await onDelete(id);
      setPendingDeleteId(null);
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className="fixed left-0 top-0 bottom-0 z-50 flex flex-col bg-white border-r border-[#e5e4e2] shadow-2xl"
        style={{ width: 340 }}
        role="dialog"
        aria-modal="true"
        aria-label="Analyzers"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-[#e5e4e2] flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-[#f05742]/10 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-3.5 h-3.5 text-[#f05742]"
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
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#1a1a18]">Analyzers</h2>
              <p className="text-[10px] text-[#6b6b68]">
                {loading
                  ? "Loading…"
                  : error
                    ? "Error loading"
                    : `${analyzers.length} analyzer${analyzers.length !== 1 ? "s" : ""}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* New analyzer */}
            {onNew && (
              <button
                onClick={() => {
                  onNew();
                  onClose();
                }}
                title="Create new analyzer"
                className="h-7 px-2 rounded-lg flex items-center gap-1 text-[10px] font-semibold text-[#f05742] hover:bg-[#f05742]/10 transition-colors select-none"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                New
              </button>
            )}
            {/* Reload */}
            <button
              onClick={onReload}
              disabled={loading}
              title="Refresh list"
              className="w-7 h-7 rounded-lg flex items-center justify-center text-[#6b6b68] hover:text-[#1a1a18] hover:bg-[#f5f5f4] transition-colors disabled:opacity-40"
            >
              <svg
                className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
            {/* Close */}
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
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto min-h-0">
          {loading ? (
            /* Loading state */
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <div className="w-8 h-8 rounded-full border-4 border-[#f05742]/20 border-t-[#f05742] animate-spin" />
              <p className="text-xs text-[#6b6b68]">Loading analyzers…</p>
            </div>
          ) : error ? (
            /* Error state */
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#fef2f2] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#dc2626]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#1a1a18]">
                Failed to load analyzers
              </p>
              <p className="text-xs text-[#6b6b68] leading-relaxed">{error}</p>
              <button
                onClick={onReload}
                className="mt-1 h-8 px-4 bg-[#f05742] hover:bg-[#d94332] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Try again
              </button>
            </div>
          ) : analyzers.length === 0 ? (
            /* Empty state */
            <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
              <div className="w-10 h-10 rounded-xl bg-[#f5f5f4] flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-[#6b6b68]/50"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <p className="text-sm font-semibold text-[#1a1a18]">
                No analyzers found
              </p>
              <p className="text-xs text-[#6b6b68] leading-relaxed">
                No analyzers exist in this Azure CU resource yet.
              </p>
            </div>
          ) : (
            /* Analyzer list */
            <div className="py-2">
              {analyzers.map((analyzer) => {
                const active = analyzer.id === selectedId;
                const isPendingDelete = pendingDeleteId === analyzer.id;
                const isDeleting = deletingId === analyzer.id;
                const date = formatDate(
                  analyzer.last_modified_at ?? analyzer.created_at,
                );
                return (
                  <div key={analyzer.id} className="relative">
                    {/* Confirm-delete overlay */}
                    {isPendingDelete && (
                      <div className="absolute inset-0 z-10 flex items-center justify-between gap-2 px-3 bg-[#fef2f2] border-l-2 border-[#dc2626]">
                        <p className="text-[11px] font-semibold text-[#dc2626] leading-tight">
                          Delete "{analyzer.name ?? analyzer.id}"?
                          <span className="block text-[10px] font-normal text-[#6b6b68]">
                            This cannot be undone.
                          </span>
                        </p>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() =>
                              void handleConfirmDelete(analyzer.id)
                            }
                            disabled={isDeleting}
                            className="h-7 px-2.5 text-[10px] font-bold text-white bg-[#dc2626] hover:bg-[#b91c1c] rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1"
                          >
                            {isDeleting ? (
                              <svg
                                className="w-3 h-3 animate-spin"
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
                                  d="M4 12a8 8 0 018-8v8z"
                                />
                              </svg>
                            ) : null}
                            Delete
                          </button>
                          <button
                            onClick={() => setPendingDeleteId(null)}
                            disabled={isDeleting}
                            className="h-7 px-2 text-[10px] font-semibold text-[#6b6b68] hover:text-[#1a1a18] hover:bg-[#f5f5f4] rounded-lg transition-colors disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    <div
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        onSelect(analyzer.id);
                        onClose();
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelect(analyzer.id);
                          onClose();
                        }
                      }}
                      className={[
                        "group w-full text-left px-3 py-3 transition-colors flex items-start gap-2 border-l-2 cursor-pointer",
                        active
                          ? "bg-[#fff5f4] border-[#f05742]"
                          : "border-transparent hover:bg-[#f9f9f8]",
                      ].join(" ")}
                    >
                      {/* Active indicator */}
                      <div className="mt-0.5 flex-shrink-0 w-3">
                        {active && (
                          <svg
                            className="w-3 h-3 text-[#f05742]"
                            fill="currentColor"
                            viewBox="0 0 20 20"
                          >
                            <path
                              fillRule="evenodd"
                              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                              clipRule="evenodd"
                            />
                          </svg>
                        )}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span
                            className={[
                              "text-sm font-semibold truncate",
                              active ? "text-[#f05742]" : "text-[#1a1a18]",
                            ].join(" ")}
                          >
                            {analyzer.name ?? analyzer.id}
                          </span>
                          <StatusBadge status={analyzer.status} />
                        </div>

                        {/* Analyzer ID (subdued, for reference) */}
                        {analyzer.name && analyzer.name !== analyzer.id && (
                          <p className="text-[10px] text-[#6b6b68]/70 font-mono mt-0.5 truncate">
                            {analyzer.id}
                          </p>
                        )}

                        {analyzer.description && (
                          <p className="text-[11px] text-[#6b6b68] mt-0.5 line-clamp-2">
                            {analyzer.description}
                          </p>
                        )}

                        <div className="flex items-center gap-2 mt-1.5">
                          <span className="text-[10px] text-[#6b6b68]">
                            {analyzer.field_count}{" "}
                            {analyzer.field_count === 1 ? "field" : "fields"}
                          </span>
                          {date && (
                            <>
                              <span className="text-[#e5e4e2]">·</span>
                              <span className="text-[10px] text-[#6b6b68]">
                                {date}
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Delete button — only shown on hover when onDelete is provided */}
                      {onDelete && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setPendingDeleteId(analyzer.id);
                            setDeleteError(null);
                          }}
                          title="Delete analyzer"
                          className="opacity-0 group-hover:opacity-100 flex-shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[#6b6b68] hover:text-[#dc2626] hover:bg-[#fef2f2] transition-all mt-0.5"
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
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Delete error footer */}
        {deleteError && (
          <div className="flex items-center gap-2 px-4 py-2.5 border-t border-[#fecaca] bg-[#fef2f2] flex-shrink-0">
            <svg
              className="w-3.5 h-3.5 text-[#dc2626] flex-shrink-0"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
              />
            </svg>
            <p className="text-[10px] text-[#dc2626] flex-1 leading-tight">
              {deleteError}
            </p>
            <button
              onClick={() => setDeleteError(null)}
              className="text-[#dc2626] hover:text-[#b91c1c]"
            >
              <svg
                className="w-3 h-3"
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
        )}
      </div>
    </>
  );
}
