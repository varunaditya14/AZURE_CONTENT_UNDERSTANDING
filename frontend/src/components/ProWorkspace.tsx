import { useState, useCallback, useEffect, useMemo } from "react";
import { useRemoteAnalyzers } from "../hooks/useRemoteAnalyzers";
import { useProFileState } from "../hooks/useProFileState";
import { useProAnalysis } from "../hooks/useProAnalysis";
import { saveAnalyzer, deleteAnalyzer } from "../api/analyzersApi";
import type { AnalyzerSchema, SchemaField } from "../types/proTypes";
import type { TabId } from "./ProRightTabs";
import { buildGroundingMap, extractPageDimension } from "../utils/grounding";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import ProTopBar from "./ProTopBar";
import ProTestFileSidebar from "./ProTestFileSidebar";
import ProPreviewPanel from "./ProPreviewPanel";
import ProRightTabs from "./ProRightTabs";
import ProAnalyzerListPanel from "./ProAnalyzerListPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate a simple unique ID for a new local field. */
let _fieldSeq = 0;
function newFieldId() {
  return `field-local-${++_fieldSeq}-${Date.now()}`;
}

/** Derive a URL-safe Azure CU analyzer ID from a display name. */
function nameToId(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .slice(0, 63) || "custom-analyzer"
  );
}

/** Map frontend ValueType → Azure CU lowercase wire type. */
function mapValueTypeToApi(vt: string): string {
  const m: Record<string, string> = {
    String: "string",
    Number: "number",
    Date: "date",
    Boolean: "boolean",
    Array: "array",
  };
  return m[vt] ?? "string";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ProWorkspace() {
  const analyzerState = useRemoteAnalyzers();
  const fileState = useProFileState();
  const proAnalysis = useProAnalysis();
  const [analyzerListOpen, setAnalyzerListOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<TabId>("schema");

  // ── Local editable schema state ─────────────────────────────────────────
  const [localSchema, setLocalSchema] = useState<AnalyzerSchema | null>(null);
  const [isNewAnalyzer, setIsNewAnalyzer] = useState(false);
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);
  const [buildSuccess, setBuildSuccess] = useState(false);

  // Auto-dismiss success banner after 6 seconds.
  useEffect(() => {
    if (!buildSuccess) return;
    const t = setTimeout(() => setBuildSuccess(false), 6000);
    return () => clearTimeout(t);
  }, [buildSuccess]);

  // Sync local schema from remote whenever the selected analyzer's detail arrives.
  useEffect(() => {
    if (analyzerState.activeSchema && !analyzerState.schemaLoading) {
      setLocalSchema(analyzerState.activeSchema);
      setIsNewAnalyzer(false);
      setBuildError(null);
    }
  }, [analyzerState.activeSchema, analyzerState.schemaLoading]);

  // ── Preview file (always the selected test file — reference panel has its own preview) ──
  const previewFile = fileState.selectedPreviewFile;

  // ── Field selection (drives bounding-box highlights in preview panel) ────
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(
    null,
  );

  // Reset field selection whenever a new analysis result arrives.
  useEffect(() => {
    setSelectedFieldName(null);
  }, [proAnalysis.result]);

  // ── Grounding data derived from the latest analysis result ───────────────
  const groundingMap = useMemo<Map<string, BoundingRegion[]>>(
    () =>
      proAnalysis.result
        ? buildGroundingMap(proAnalysis.result.raw_result)
        : new Map(),
    [proAnalysis.result],
  );

  const pageDimension = useMemo<PageDimension | null>(
    () =>
      proAnalysis.result
        ? extractPageDimension(proAnalysis.result.raw_result)
        : null,
    [proAnalysis.result],
  );

  const fieldDataMap = useMemo(
    () =>
      new Map(
        (proAnalysis.result?.fields ?? []).map((f) => [
          f.name,
          { value: f.value, confidence: f.confidence },
        ]),
      ),
    [proAnalysis.result],
  );

  // ── File blob for the currently previewed file ────────────────────────────
  const previewFileBlob: File | null = previewFile
    ? (fileState.getFileBlob(previewFile.id) ?? null)
    : null;

  // ── Top-bar display name ─────────────────────────────────────────────────
  const topBarName = localSchema
    ? localSchema.name
    : analyzerState.loading
      ? "Loading…"
      : "Select an analyzer";

  // ── Field mutation handlers ───────────────────────────────────────────────

  const handleFieldAdd = useCallback((field: Omit<SchemaField, "id">) => {
    setLocalSchema((prev) =>
      prev
        ? { ...prev, fields: [...prev.fields, { id: newFieldId(), ...field }] }
        : prev,
    );
  }, []);

  const handleFieldUpdate = useCallback(
    (fieldId: string, patch: Partial<Omit<SchemaField, "id">>) => {
      setLocalSchema((prev) =>
        prev
          ? {
              ...prev,
              fields: prev.fields.map((f) =>
                f.id === fieldId ? { ...f, ...patch } : f,
              ),
            }
          : prev,
      );
    },
    [],
  );

  const handleFieldDelete = useCallback((fieldId: string) => {
    setLocalSchema((prev) =>
      prev
        ? { ...prev, fields: prev.fields.filter((f) => f.id !== fieldId) }
        : prev,
    );
  }, []);

  const handleSchemaUpdate = useCallback(
    (
      patch: Partial<Pick<AnalyzerSchema, "name" | "description" | "status">>,
    ) => {
      setLocalSchema((prev) => (prev ? { ...prev, ...patch } : prev));
    },
    [],
  );

  const handleExportSchema = useCallback(() => {
    if (!localSchema) return;
    const json = JSON.stringify(localSchema, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${localSchema.id || "schema"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [localSchema]);

  const handleImportSchema = useCallback((json: string) => {
    try {
      const parsed = JSON.parse(json) as Partial<AnalyzerSchema>;
      if (parsed && typeof parsed === "object") {
        setLocalSchema((prev) =>
          prev
            ? {
                ...prev,
                name: parsed.name ?? prev.name,
                description: parsed.description ?? prev.description,
                fields: Array.isArray(parsed.fields)
                  ? parsed.fields.map((f, i) => ({
                      id: (f as SchemaField).id ?? `imported-${i}`,
                      name: (f as SchemaField).name ?? "",
                      description: (f as SchemaField).description ?? "",
                      valueType: (f as SchemaField).valueType ?? "String",
                      method: (f as SchemaField).method ?? "Extract",
                    }))
                  : prev.fields,
              }
            : prev,
        );
      }
    } catch {
      /* ignore malformed JSON */
    }
  }, []);

  // ── Start new analyzer ────────────────────────────────────────────────────

  const handleStartNewAnalyzer = useCallback(() => {
    analyzerState.clearSelection();
    proAnalysis.clearResult();
    setLocalSchema({
      id: "",
      name: "New Analyzer",
      description: "",
      status: "draft",
      updatedAt: new Date().toISOString(),
      fields: [],
    });
    setIsNewAnalyzer(true);
    setBuildError(null);
    setActiveRightTab("schema");
  }, [analyzerState, proAnalysis]);

  // ── Build (create / update) analyzer ─────────────────────────────────────

  const handleBuildAnalyzer = useCallback(async () => {
    if (!localSchema) return;

    const analyzerId = isNewAnalyzer
      ? nameToId(localSchema.name)
      : (analyzerState.selectedId ?? nameToId(localSchema.name));

    if (!analyzerId) return;

    setBuilding(true);
    setBuildError(null);
    setBuildSuccess(false);

    try {
      const savedDetail = await saveAnalyzer(analyzerId, {
        description: localSchema.description,
        schema_name: localSchema.name,
        schema_description: localSchema.description,
        fields: localSchema.fields.map((f) => ({
          name: f.name,
          description: f.description,
          type: mapValueTypeToApi(f.valueType),
          method: f.method.toLowerCase(),
          ...(f.itemsDef ? { items_def: f.itemsDef } : {}),
        })),
      });

      // Apply the confirmed-correct data from the build response directly.
      // Avoids a stale read-after-write from a second Azure GET.
      analyzerState.applyDetailFromSave(analyzerId, savedDetail);

      // Reload the list in background so field_count / last_modified_at / name
      // update in the analyzer drawer without blocking the workspace.
      analyzerState.reload();

      // Clear any previous analysis result — the schema just changed so old
      // results are now stale.  The user should re-run analysis.
      proAnalysis.clearResult();

      setBuildSuccess(true);
    } catch (err: unknown) {
      setBuildError(
        err instanceof Error ? err.message : "Build failed — check console",
      );
    } finally {
      setBuilding(false);
    }
  }, [localSchema, isNewAnalyzer, analyzerState, proAnalysis]);

  // ── Delete analyzer ─────────────────────────────────────────────────────

  const handleDeleteAnalyzer = useCallback(
    async (analyzerId: string) => {
      await deleteAnalyzer(analyzerId);
      // If the deleted analyzer was selected, clear the workspace state.
      if (analyzerState.selectedId === analyzerId) {
        analyzerState.clearSelection();
        proAnalysis.clearResult();
        setLocalSchema(null);
        setIsNewAnalyzer(false);
        setBuildError(null);
        setActiveRightTab("schema");
      }
      // Refresh the list so the deleted entry disappears.
      analyzerState.reload();
    },
    [analyzerState, proAnalysis],
  );

  // ── Run analysis ──────────────────────────────────────────────────────────

  const handleRunAnalysis = useCallback(async () => {
    const analyzerId = analyzerState.selectedId;
    if (!analyzerId) return;

    const activeSet = fileState.activeTestFileSet;
    let useSavedPath = Boolean(activeSet.savedId) && !activeSet.isDirty;
    const savedSetId = activeSet.savedId;

    // Auto-save a dirty test set before running.
    if (activeSet.savedId && activeSet.isDirty) {
      try {
        await fileState.saveTestFileSet(activeSet.id);
        useSavedPath = true;
      } catch {
        return; // save failed — abort run
      }
    }

    // Resolve reference files: prefer saved set (auto-save if dirty).
    const activeRefSet = fileState.activeReferenceFileSet;
    const savedRefSetId = activeRefSet.savedId;
    let useSavedRefPath = Boolean(savedRefSetId) && !activeRefSet.isDirty;
    if (savedRefSetId && activeRefSet.isDirty) {
      try {
        await fileState.saveReferenceFileSet(activeRefSet.id);
        useSavedRefPath = true;
      } catch {
        /* ignore — fall back to uploading blobs */
      }
    }

    const testFiles = useSavedPath ? [] : fileState.getAllTestFileBlobs();
    if (!useSavedPath && testFiles.length === 0) return;
    const referenceFiles = useSavedRefPath
      ? []
      : fileState.getAllReferenceFileBlobs();

    setActiveRightTab("prediction");
    await proAnalysis.runAnalysis(
      testFiles,
      referenceFiles,
      analyzerId,
      useSavedPath ? savedSetId : undefined,
      useSavedRefPath ? (savedRefSetId ?? undefined) : undefined,
    );
  }, [analyzerState.selectedId, fileState, proAnalysis.runAnalysis]);

  // Run is disabled when there's no saved remote analyzer or no test files,
  // or when a build is in progress (the analyzer is being (re)created).
  const runDisabled =
    !analyzerState.selectedId ||
    isNewAnalyzer ||
    building ||
    fileState.loadingSetBlobs ||
    fileState.activeTestFileSet.files.length === 0;

  // Build button behaviour depends on state:
  //   • no local schema at all → button acts as "New analyzer" (always enabled)
  //   • schema exists but name is blank → disabled (must fill in a name first)
  //   • schema exists with a valid name → enabled as "Build analyzer"
  const hasSchema = localSchema !== null;
  const hasValidName = hasSchema && localSchema!.name.trim().length > 0;
  const buildDisabled = hasSchema && !hasValidName;
  const buildLabel = hasSchema ? "Build analyzer" : "New analyzer";

  // Unified click: start new when no schema, build when schema is ready.
  const handleBuildOrNew = useCallback(() => {
    if (!localSchema) {
      handleStartNewAnalyzer();
    } else {
      void handleBuildAnalyzer();
    }
  }, [localSchema, handleStartNewAnalyzer, handleBuildAnalyzer]);

  return (
    <div
      className="w-full rounded-[24px] border border-[#e5e4e2] bg-white flex flex-col gap-4"
      style={{ padding: 16, minHeight: 720 }}
    >
      {/* Top bar: title row + action bar */}
      <ProTopBar
        activeSchemaName={topBarName}
        onAnalyzerListOpen={() => setAnalyzerListOpen(true)}
        onRunAnalysis={handleRunAnalysis}
        running={proAnalysis.running}
        runDisabled={runDisabled}
        onBuildAnalyzer={handleBuildOrNew}
        building={building}
        buildDisabled={buildDisabled}
        buildLabel={buildLabel}
      />

      {/* Build error banner */}
      {buildError && (
        <div className="flex items-start gap-2 px-4 py-3 bg-[#fef2f2] border border-[#fecaca] rounded-xl text-sm text-[#dc2626]">
          <svg
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="flex-1">{buildError}</span>
          <button
            onClick={() => setBuildError(null)}
            className="flex-shrink-0 text-[#dc2626] hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      {/* Build success banner */}
      {buildSuccess && !buildError && (
        <div className="flex items-start gap-2 px-4 py-3 bg-[#f0fdf4] border border-[#bbf7d0] rounded-xl text-sm text-[#15803d]">
          <svg
            className="w-4 h-4 mt-0.5 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="flex-1">Analyzer built and saved successfully.</span>
          <button
            onClick={() => setBuildSuccess(false)}
            className="flex-shrink-0 text-[#15803d] hover:opacity-70"
          >
            ×
          </button>
        </div>
      )}

      {/* 3-column workspace body */}
      <div className="flex-1 min-h-0 overflow-x-auto">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px minmax(420px, 1fr) minmax(420px, 1fr)",
            gap: 16,
            height: 640,
          }}
        >
          <ProTestFileSidebar
            testFileSets={fileState.testFileSets}
            selectedTestFileSetId={fileState.selectedTestFileSetId}
            selectedPreviewFileId={fileState.selectedPreviewFileId}
            onCreateSet={fileState.createTestFileSet}
            onRenameSet={fileState.renameTestFileSet}
            onDeleteSet={fileState.deleteTestFileSet}
            onSelectSet={fileState.selectTestFileSet}
            onAddFiles={fileState.addFilesToTestSet}
            onRemoveFile={fileState.removeFileFromTestSet}
            onSelectPreviewFile={(id) => fileState.setSelectedPreviewFileId(id)}
            onSaveSet={fileState.saveTestFileSet}
            saving={fileState.saving}
            saveError={fileState.saveError}
            setsLoading={fileState.setsLoading}
          />
          <ProPreviewPanel
            previewFile={previewFile}
            previewFileBlob={previewFileBlob}
            groundingMap={groundingMap}
            pageDimension={pageDimension}
            fieldDataMap={fieldDataMap}
            selectedFieldName={selectedFieldName}
            onFieldSelect={setSelectedFieldName}
          />
          <ProRightTabs
            schema={localSchema}
            schemaLoading={analyzerState.schemaLoading}
            onFieldAdd={handleFieldAdd}
            onFieldUpdate={handleFieldUpdate}
            onFieldDelete={handleFieldDelete}
            onSchemaUpdate={handleSchemaUpdate}
            exportSchema={handleExportSchema}
            importSchema={handleImportSchema}
            activeTab={activeRightTab}
            onActiveTabChange={setActiveRightTab}
            referenceFileSets={fileState.referenceFileSets}
            selectedReferenceFileSetId={fileState.selectedReferenceFileSetId}
            selectedReferenceFileId={fileState.selectedReferenceFileId}
            onSelectReferenceSet={fileState.selectReferenceFileSet}
            onCreateReferenceSet={fileState.createReferenceFileSet}
            onRenameReferenceSet={fileState.renameReferenceFileSet}
            onDeleteReferenceSet={fileState.deleteReferenceFileSet}
            onSaveReferenceSet={fileState.saveReferenceFileSet}
            onAddFilesToReferenceSet={fileState.addFilesToReferenceSet}
            onRemoveFileFromReferenceSet={fileState.removeFileFromReferenceSet}
            onSelectReferenceFile={fileState.setSelectedReferenceFileId}
            savingReferenceSet={fileState.savingReferenceSet}
            referenceSetSaveError={fileState.referenceSetSaveError}
            setsLoading={fileState.setsLoading}
            analysisResult={proAnalysis.result}
            analysisRunning={proAnalysis.running}
            analysisError={proAnalysis.error}
            selectedFieldName={selectedFieldName}
            onFieldSelect={setSelectedFieldName}
            onNew={handleStartNewAnalyzer}
          />
        </div>
      </div>

      {/* Analyzer list drawer (fixed overlay) */}
      {analyzerListOpen && (
        <ProAnalyzerListPanel
          analyzers={analyzerState.analyzers}
          loading={analyzerState.loading}
          error={analyzerState.error}
          selectedId={analyzerState.selectedId}
          onSelect={(id) => {
            analyzerState.selectAnalyzer(id);
            proAnalysis.clearResult();
            setAnalyzerListOpen(false);
          }}
          onClose={() => setAnalyzerListOpen(false)}
          onReload={analyzerState.reload}
          onNew={handleStartNewAnalyzer}
          onDelete={handleDeleteAnalyzer}
        />
      )}
    </div>
  );
}
