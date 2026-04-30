// ---------------------------------------------------------------------------
// Pro-mode domain types
// Structured for future backend integration — IDs are strings (UUID-ready).
// ---------------------------------------------------------------------------

export const VALUE_TYPES = [
  "String",
  "Number",
  "Date",
  "Boolean",
  "Array",
] as const;

export const FIELD_METHODS = ["Extract", "Classify", "Generate"] as const;

export type ValueType = (typeof VALUE_TYPES)[number];
export type FieldMethod = (typeof FIELD_METHODS)[number];
export type SchemaStatus = "draft" | "saved";

export interface SchemaField {
  id: string;
  name: string;
  description: string;
  valueType: ValueType;
  method: FieldMethod;
  /** Preserved opaque `items` definition for array fields — not editable in UI. */
  itemsDef?: Record<string, unknown>;
}

export interface AnalyzerSchema {
  id: string;
  name: string;
  description: string;
  status: SchemaStatus;
  /** ISO 8601 date string — use for display + sort */
  updatedAt: string;
  fields: SchemaField[];
}
