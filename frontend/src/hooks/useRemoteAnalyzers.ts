import { useState, useCallback, useEffect, useRef } from "react";
import type {
  AnalyzerSchema,
  SchemaField,
  ValueType,
  FieldMethod,
} from "../types/proTypes";
import type {
  RemoteAnalyzerDetail,
  RemoteAnalyzerListItem,
} from "../types/remoteAnalyzer";
import { getAnalyzerDetail, listAnalyzers } from "../api/analyzersApi";

// ---------------------------------------------------------------------------
// Type mappers — Azure CU field types → local ValueType / FieldMethod
// ---------------------------------------------------------------------------

function mapType(raw: string): ValueType {
  const t = (raw || "string").toLowerCase();
  if (t === "number" || t === "integer") return "Number";
  if (t === "date" || t === "datetime" || t === "time") return "Date";
  if (t === "boolean") return "Boolean";
  if (t === "array") return "Array";
  return "String";
}

function mapMethod(raw: string | null | undefined): FieldMethod {
  const m = (raw ?? "extract").toLowerCase();
  if (m === "classify") return "Classify";
  if (m === "generate") return "Generate";
  return "Extract";
}

function toAnalyzerSchema(detail: RemoteAnalyzerDetail): AnalyzerSchema {
  const fields: SchemaField[] = (detail.fields ?? []).map((f, i) => {
    const field: SchemaField = {
      // Stable ID that includes both position and name
      id: `${detail.id}__${i}__${f.name}`,
      name: f.name,
      description: f.description ?? "",
      valueType: mapType(f.type ?? "string"),
      method: mapMethod(f.method),
    };
    // Preserve the raw items definition for array fields so it can be
    // round-tripped back to Azure without modification.
    if (f.items) {
      field.itemsDef = f.items as Record<string, unknown>;
    }
    return field;
  });

  return {
    id: detail.id,
    name: detail.name ?? detail.id,
    description: detail.description ?? "",
    // "ready" is the Azure CU equivalent of "saved/active"
    status: (detail.status ?? "").toLowerCase() === "ready" ? "saved" : "draft",
    updatedAt:
      detail.last_modified_at ?? detail.created_at ?? new Date().toISOString(),
    fields,
  };
}

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface RemoteAnalyzerState {
  /** All analyzers fetched from the backend (summary list). */
  analyzers: RemoteAnalyzerListItem[];
  /** True while the analyzer list is being fetched. */
  loading: boolean;
  /** Non-null if the list fetch failed. */
  error: string | null;
  /** ID of the currently selected analyzer (null = none selected). */
  selectedId: string | null;
  /** Full schema of the selected analyzer, null until loaded. */
  activeSchema: AnalyzerSchema | null;
  /** True while the selected analyzer's schema detail is loading. */
  schemaLoading: boolean;
  /** Select an analyzer — triggers a schema detail fetch. */
  selectAnalyzer: (id: string) => void;
  /** Re-fetch the analyzer list. */
  reload: () => void;
  /** Clear the current selection (used when starting a new analyzer). */
  clearSelection: () => void;
  /**
   * Reload the list and then select the given analyzer ID.
   * Use after a successful save to refresh both the list and schema.
   */
  reloadAndSelect: (id: string) => Promise<void>;
  /**
   * Apply a RemoteAnalyzerDetail obtained directly from a save/build response,
   * bypassing a second GET.  Avoids read-after-write stale data from Azure.
   */
  applyDetailFromSave: (id: string, detail: RemoteAnalyzerDetail) => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useRemoteAnalyzers(): RemoteAnalyzerState {
  const [analyzers, setAnalyzers] = useState<RemoteAnalyzerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSchema, setActiveSchema] = useState<AnalyzerSchema | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  // Track the in-flight request so stale results from a previous selection are
  // discarded when the user switches analyzers quickly.
  const pendingIdRef = useRef<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    listAnalyzers()
      .then((items) => {
        setAnalyzers(items);
      })
      .catch((err: unknown) => {
        setError(
          err instanceof Error ? err.message : "Failed to load analyzers",
        );
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  // Fetch list on mount
  useEffect(() => {
    reload();
  }, [reload]);

  const selectAnalyzer = useCallback((id: string) => {
    pendingIdRef.current = id;
    setSelectedId(id);
    setSchemaLoading(true);
    setActiveSchema(null);

    getAnalyzerDetail(id)
      .then((detail) => {
        // Ignore results that arrived after the user already switched
        if (pendingIdRef.current !== id) return;
        setActiveSchema(toAnalyzerSchema(detail));
      })
      .catch((err: unknown) => {
        if (pendingIdRef.current !== id) return;
        console.error("[useRemoteAnalyzers] schema load failed:", err);
      })
      .finally(() => {
        if (pendingIdRef.current === id) {
          setSchemaLoading(false);
        }
      });
  }, []);

  const clearSelection = useCallback(() => {
    pendingIdRef.current = null;
    setSelectedId(null);
    setActiveSchema(null);
    setSchemaLoading(false);
  }, []);

  const applyDetailFromSave = useCallback(
    (id: string, detail: RemoteAnalyzerDetail) => {
      // Set the confirmed-correct schema directly from the save response.
      // This prevents a stale second GET overwriting the user's saved data.
      pendingIdRef.current = id;
      setSelectedId(id);
      setActiveSchema(toAnalyzerSchema(detail));
      setSchemaLoading(false);
    },
    [],
  );

  const reloadAndSelect = useCallback(
    async (id: string): Promise<void> => {
      setLoading(true);
      setError(null);
      try {
        const items = await listAnalyzers();
        setAnalyzers(items);
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : "Failed to reload analyzers",
        );
      } finally {
        setLoading(false);
      }
      // Now load the specific analyzer detail.
      selectAnalyzer(id);
    },
    [selectAnalyzer],
  );

  return {
    analyzers,
    loading,
    error,
    selectedId,
    activeSchema,
    schemaLoading,
    selectAnalyzer,
    reload,
    clearSelection,
    reloadAndSelect,
    applyDetailFromSave,
  };
}
