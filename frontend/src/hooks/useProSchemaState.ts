import { useState, useCallback } from "react";
import type {
  AnalyzerSchema,
  SchemaField,
  SchemaStatus,
  ValueType,
  FieldMethod,
} from "../types/proTypes";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function now(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Initial data
// ---------------------------------------------------------------------------

const INITIAL_SCHEMAS: AnalyzerSchema[] = [
  {
    id: "schema-1",
    name: "New Analyzer",
    description: "",
    status: "draft",
    updatedAt: "2024-01-01T00:00:00Z",
    fields: [],
  },
];

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface ProSchemaState {
  schemas: AnalyzerSchema[];
  selectedSchemaId: string;
  activeSchema: AnalyzerSchema;
  setSelectedSchemaId: (id: string) => void;
  addSchema: (name: string, description: string) => void;
  updateSchema: (
    id: string,
    patch: Partial<Pick<AnalyzerSchema, "name" | "description" | "status">>,
  ) => void;
  deleteSchema: (id: string) => void;
  addField: (field: Omit<SchemaField, "id">) => void;
  updateField: (
    fieldId: string,
    patch: Partial<{
      name: string;
      description: string;
      valueType: ValueType;
      method: FieldMethod;
    }>,
  ) => void;
  deleteField: (fieldId: string) => void;
  exportSchema: () => void;
  importSchemaFromJson: (json: string) => void;
}

export function useProSchemaState(): ProSchemaState {
  const [schemas, setSchemas] = useState<AnalyzerSchema[]>(INITIAL_SCHEMAS);
  const [selectedSchemaId, setSelectedSchemaId] = useState<string>(
    INITIAL_SCHEMAS[0].id,
  );

  const activeSchema =
    schemas.find((s) => s.id === selectedSchemaId) ?? schemas[0];

  // ── Schema CRUD ───────────────────────────────────────────────────────────

  const addSchema = useCallback((name: string, description: string) => {
    const created: AnalyzerSchema = {
      id: `schema-${uid()}`,
      name: name.trim() || "New Analyzer",
      description,
      status: "draft",
      updatedAt: now(),
      fields: [],
    };
    setSchemas((prev) => [...prev, created]);
    setSelectedSchemaId(created.id);
  }, []);

  const updateSchema = useCallback(
    (
      id: string,
      patch: Partial<Pick<AnalyzerSchema, "name" | "description" | "status">>,
    ) => {
      setSchemas((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, ...patch, updatedAt: now() } : s,
        ),
      );
    },
    [],
  );

  // Deletes a schema; ensures at least one always remains.
  // On deletion of the active schema, selects the nearest sibling.
  const deleteSchema = useCallback(
    (id: string) => {
      setSchemas((prev) => {
        const next = prev.filter((s) => s.id !== id);
        return next.length > 0 ? next : prev;
      });
      setSelectedSchemaId((prevId) => {
        if (prevId !== id) return prevId;
        const remaining = schemas.filter((s) => s.id !== id);
        if (remaining.length === 0) return prevId;
        const deletedIdx = schemas.findIndex((s) => s.id === id);
        return remaining[Math.max(0, deletedIdx - 1)].id;
      });
    },
    [schemas],
  );

  // ── Field CRUD ────────────────────────────────────────────────────────────

  const addField = useCallback(
    (field: Omit<SchemaField, "id">) => {
      const newField: SchemaField = { id: `f-${uid()}`, ...field };
      setSchemas((prev) =>
        prev.map((s) =>
          s.id === selectedSchemaId
            ? { ...s, fields: [...s.fields, newField], updatedAt: now() }
            : s,
        ),
      );
    },
    [selectedSchemaId],
  );

  const updateField = useCallback(
    (fieldId: string, patch: Partial<Omit<SchemaField, "id">>) => {
      setSchemas((prev) =>
        prev.map((s) =>
          s.id === selectedSchemaId
            ? {
                ...s,
                fields: s.fields.map((f) =>
                  f.id === fieldId ? { ...f, ...patch } : f,
                ),
                updatedAt: now(),
              }
            : s,
        ),
      );
    },
    [selectedSchemaId],
  );

  const deleteField = useCallback(
    (fieldId: string) => {
      setSchemas((prev) =>
        prev.map((s) =>
          s.id === selectedSchemaId
            ? {
                ...s,
                fields: s.fields.filter((f) => f.id !== fieldId),
                updatedAt: now(),
              }
            : s,
        ),
      );
    },
    [selectedSchemaId],
  );

  // ── Import / Export ───────────────────────────────────────────────────────

  const exportSchema = useCallback(() => {
    const data = JSON.stringify(activeSchema, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${activeSchema.name.replace(/\s+/g, "_")}_schema.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [activeSchema]);

  const importSchemaFromJson = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Partial<AnalyzerSchema>;
      const imported: AnalyzerSchema = {
        id: `schema-${uid()}`,
        name: parsed.name ?? "Imported Schema",
        description: parsed.description ?? "",
        status: "draft",
        updatedAt: now(),
        fields: Array.isArray(parsed.fields) ? parsed.fields : [],
      };
      setSchemas((prev) => [...prev, imported]);
      setSelectedSchemaId(imported.id);
    } catch {
      // Silently ignore malformed JSON — UI can surface this later
    }
  }, []);

  return {
    schemas,
    selectedSchemaId,
    activeSchema,
    setSelectedSchemaId,
    addSchema,
    updateSchema,
    deleteSchema,
    addField,
    updateField,
    deleteField,
    exportSchema,
    importSchemaFromJson,
  };
}
