import { useState, useRef } from "react";
import type { AnalyzerSchema, SchemaField, ValueType } from "../types/proTypes";
import ProFieldEditorModal from "./ProFieldEditorModal";
import ProSchemaSettingsModal from "./ProSchemaSettingsModal";

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const TYPE_BADGE_STYLES: Record<string, string> = {
  String: "bg-[#eff6ff] text-[#1d4ed8]",
  Number: "bg-[#f0fdf4] text-[#15803d]",
  Date: "bg-[#fdf4ff] text-[#9333ea]",
  Boolean: "bg-[#fff7ed] text-[#c2410c]",
  Array: "bg-[#f0f9ff] text-[#0369a1]",
};

function TypeBadge({ type }: { type: string }) {
  const cls = TYPE_BADGE_STYLES[type] ?? "bg-[#f5f5f4] text-[#6b6b68]";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}
    >
      {type}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  schema: AnalyzerSchema;
  /** When true, all mutation controls are hidden (no add/edit/delete/import). */
  readOnly?: boolean;
  onFieldAdd: (field: Omit<SchemaField, "id">) => void;
  onFieldUpdate: (
    fieldId: string,
    patch: Partial<Omit<SchemaField, "id">>,
  ) => void;
  onFieldDelete: (fieldId: string) => void;
  onSchemaUpdate: (
    patch: Partial<Pick<AnalyzerSchema, "name" | "description" | "status">>,
  ) => void;
  exportSchema: () => void;
  importSchema: (json: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProSchemaTab({
  schema,
  readOnly = false,
  onFieldAdd,
  onFieldUpdate,
  onFieldDelete,
  onSchemaUpdate,
  exportSchema,
  importSchema,
}: Props) {
  const [fieldModalOpen, setFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<SchemaField | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Grid column widths: name | description | type | method | actions
  const COL = readOnly
    ? "1fr 1.6fr 0.75fr 0.65fr"
    : "1fr 1.6fr 0.75fr 0.65fr 80px";

  function openAdd() {
    setEditingField(null);
    setFieldModalOpen(true);
  }

  function openEdit(field: SchemaField) {
    setEditingField(field);
    setFieldModalOpen(true);
  }

  function handleFieldSave(data: Omit<SchemaField, "id">) {
    if (editingField) {
      onFieldUpdate(editingField.id, data);
    } else {
      onFieldAdd(data);
    }
  }

  function handleImportClick() {
    importInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const text = evt.target?.result;
      if (typeof text === "string") importSchema(text);
    };
    reader.readAsText(file);
    e.target.value = ""; // reset so the same file can be re-imported
  }

  return (
    <>
      <div className="h-full flex flex-col gap-3 p-4 overflow-y-auto">
        {/* ── Toolbar — hidden in readOnly mode ─────────────────────────── */}
        {!readOnly && (
          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {/* Add new field — primary */}
            <button
              onClick={openAdd}
              className="h-8 px-3 flex items-center gap-1.5 bg-[#f05742] hover:bg-[#d94332] text-white text-xs font-semibold rounded-lg transition-colors"
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
              Add new field
            </button>

            {/* Schema settings */}
            <button
              onClick={() => setSettingsOpen(true)}
              className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium rounded-lg border border-[#e5e4e2] text-[#1a1a18] hover:border-[#d1d0ce] bg-white transition-colors"
            >
              <svg
                className="w-3 h-3 text-[#6b6b68]"
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
              Schema settings
            </button>

            {/* Import */}
            <button
              onClick={handleImportClick}
              className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium rounded-lg border border-[#e5e4e2] text-[#1a1a18] hover:border-[#d1d0ce] bg-white transition-colors"
            >
              <svg
                className="w-3 h-3 text-[#6b6b68]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </svg>
              Import
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleImportFile}
            />

            {/* Export */}
            <button
              onClick={exportSchema}
              className="h-8 px-3 flex items-center gap-1.5 text-xs font-medium rounded-lg border border-[#e5e4e2] text-[#1a1a18] hover:border-[#d1d0ce] bg-white transition-colors"
            >
              <svg
                className="w-3 h-3 text-[#6b6b68]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
              Export
            </button>
          </div>
        )}

        {/* ── Active schema info row ──────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[11px] font-semibold text-[#6b6b68] truncate max-w-[180px]">
            {schema.name}
          </span>
          <span className="text-[10px] text-[#6b6b68] bg-[#f5f5f4] border border-[#e5e4e2] rounded-full px-2 py-0.5 flex-shrink-0">
            {schema.fields.length}{" "}
            {schema.fields.length === 1 ? "field" : "fields"}
          </span>
          <span
            className={[
              "text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0",
              schema.status === "saved"
                ? "bg-[#f0fdf4] text-[#15803d]"
                : "bg-[#fff7ed] text-[#c2410c]",
            ].join(" ")}
          >
            {schema.status}
          </span>
        </div>

        {/* ── Empty state ─────────────────────────────────────────────────── */}
        {schema.fields.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#e5e4e2] py-12">
            <div className="w-10 h-10 rounded-xl bg-[#f5f5f4] flex items-center justify-center">
              <svg
                className="w-5 h-5 text-[#6b6b68]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#1a1a18]">
                {readOnly ? "No fields defined" : "No fields yet"}
              </p>
              <p className="text-xs text-[#6b6b68] mt-0.5">
                {readOnly
                  ? "This analyzer has no schema fields."
                  : 'Click "Add new field" to define the schema'}
              </p>
            </div>
            {!readOnly && (
              <button
                onClick={openAdd}
                className="h-8 px-4 bg-[#f05742] hover:bg-[#d94332] text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Add new field
              </button>
            )}
          </div>
        ) : (
          /* ── Field table ─────────────────────────────────────────────── */
          <div className="border border-[#e5e4e2] rounded-xl overflow-hidden flex-shrink-0">
            {/* Header */}
            <div
              className="grid bg-[#f9f9f8] border-b border-[#e5e4e2]"
              style={{ gridTemplateColumns: COL }}
            >
              {[
                "Field name",
                "Field description",
                "Value type",
                "Method",
                ...(readOnly ? [] : ["Actions"]),
              ].map((col) => (
                <div
                  key={col}
                  className="px-3 py-2.5 text-[10px] font-semibold text-[#6b6b68] uppercase tracking-wider"
                >
                  {col}
                </div>
              ))}
            </div>

            {/* Rows */}
            {schema.fields.map((field) => (
              <div
                key={field.id}
                className="grid border-b border-[#e5e4e2] last:border-0 hover:bg-[#fafaf9] transition-colors group"
                style={{ gridTemplateColumns: COL }}
              >
                <div className="px-3 py-3 text-sm font-semibold text-[#1a1a18] group-hover:text-[#f05742] transition-colors truncate">
                  {field.name}
                </div>
                <div className="px-3 py-3 text-sm text-[#6b6b68] truncate">
                  {field.description}
                </div>
                <div className="px-3 py-3">
                  <TypeBadge type={field.valueType as ValueType} />
                </div>
                <div className="px-3 py-3 text-sm text-[#6b6b68]">
                  {field.method}
                </div>

                {/* Actions — appear on row hover, hidden in readOnly mode */}
                {!readOnly && (
                  <div className="px-2 py-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {/* Edit */}
                    <button
                      onClick={() => openEdit(field)}
                      title="Edit field"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/8 transition-colors"
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
                          d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                        />
                      </svg>
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => onFieldDelete(field.id)}
                      title="Delete field"
                      className="w-6 h-6 rounded-md flex items-center justify-center text-[#6b6b68] hover:text-[#dc2626] hover:bg-[#dc2626]/8 transition-colors"
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
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Modals ─────────────────────────────────────────────────────────── */}
      {fieldModalOpen && (
        <ProFieldEditorModal
          initial={editingField}
          onSave={handleFieldSave}
          onClose={() => setFieldModalOpen(false)}
        />
      )}

      {settingsOpen && (
        <ProSchemaSettingsModal
          schema={schema}
          onSave={onSchemaUpdate}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </>
  );
}
