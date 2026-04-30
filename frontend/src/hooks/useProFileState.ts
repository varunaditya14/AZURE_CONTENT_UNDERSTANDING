import { useState, useCallback, useRef, useEffect } from "react";
import type {
  ProFile,
  TestFileSet,
  ReferenceFileSet,
  FileKind,
  FileStatus,
} from "../types/proFileTypes";
import {
  listTestFileSets,
  createTestFileSet as apiCreateTestFileSet,
  updateTestFileSet as apiUpdateTestFileSet,
  deleteTestFileSet as apiDeleteTestFileSet,
  fetchFileBlob,
  getFileUrl,
} from "../api/testFileSetsApi";
import type { SavedTestFileSet } from "../api/testFileSetsApi";
import {
  listReferenceFileSets,
  createReferenceFileSet as apiCreateReferenceFileSet,
  updateReferenceFileSet as apiUpdateReferenceFileSet,
  deleteReferenceFileSet as apiDeleteReferenceFileSet,
  fetchReferenceFileBlob,
  getReferenceFileUrl,
} from "../api/referenceFileSetsApi";
import type { SavedReferenceFileSet } from "../api/referenceFileSetsApi";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uid(): string {
  return Math.random().toString(36).slice(2, 10);
}

function detectFileKind(file: File): FileKind {
  if (file.type === "application/pdf") return "pdf";
  if (file.type.startsWith("image/")) return "image";
  if (
    file.type ===
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  )
    return "docx";
  if (file.type === "text/plain") return "txt";
  return "other";
}

function kindFromString(k: string): FileKind {
  if (k === "pdf" || k === "image" || k === "docx" || k === "txt") return k;
  return "other";
}

/** Convert a backend SavedTestFileSet into a local TestFileSet (no blobs pre-loaded). */
function savedToLocal(saved: SavedTestFileSet): TestFileSet {
  return {
    id: saved.id,
    savedId: saved.id,
    name: saved.name,
    isDirty: false,
    files: saved.files.map((fi) => ({
      id: `tf-${fi.id}`,
      name: fi.name,
      kind: kindFromString(fi.kind),
      size: fi.size,
      previewUrl: getFileUrl(saved.id, fi.id),
      status: "ready" as FileStatus,
      sourceKind: "test" as const,
      serverId: fi.id,
    })),
  };
}

/** Convert a backend SavedReferenceFileSet into a local ReferenceFileSet (no blobs pre-loaded). */
function savedRefToLocal(saved: SavedReferenceFileSet): ReferenceFileSet {
  return {
    id: saved.id,
    savedId: saved.id,
    name: saved.name,
    isDirty: false,
    files: saved.files.map((fi) => ({
      id: `rf-${fi.id}`,
      name: fi.name,
      kind: kindFromString(fi.kind),
      size: fi.size,
      previewUrl: getReferenceFileUrl(saved.id, fi.id),
      status: "ready" as FileStatus,
      sourceKind: "reference" as const,
      serverId: fi.id,
    })),
  };
}

function makeInitialRefSet(): ReferenceFileSet {
  return {
    id: `rfs-${Math.random().toString(36).slice(2, 10)}`,
    name: "New reference file set",
    files: [],
    isDirty: false,
  };
}

// ---------------------------------------------------------------------------
// Initial data (kept as fallback — overridden by backend data on mount)
// ---------------------------------------------------------------------------

const INITIAL_TEST_FILE_SETS: TestFileSet[] = [
  {
    id: "tfs-1",
    name: "New test file set",
    files: [],
    isDirty: false,
  },
];

const INITIAL_REF_FILE_SETS: ReferenceFileSet[] = [makeInitialRefSet()];

// ---------------------------------------------------------------------------
// Public interface
// ---------------------------------------------------------------------------

export interface ProFileState {
  // Test file sets
  testFileSets: TestFileSet[];
  selectedTestFileSetId: string;
  activeTestFileSet: TestFileSet;
  selectedPreviewFileId: string | null;
  selectedPreviewFile: ProFile | null;

  // Reference file sets
  referenceFileSets: ReferenceFileSet[];
  selectedReferenceFileSetId: string;
  activeReferenceFileSet: ReferenceFileSet;
  /** Convenience: files in the active reference set. */
  referenceFiles: ProFile[];
  selectedReferenceFileId: string | null;
  selectedReferenceFile: ProFile | null;

  // Loading / saving state
  setsLoading: boolean;
  saving: boolean;
  saveError: string | null;
  savingReferenceSet: boolean;
  referenceSetSaveError: string | null;
  loadingSetBlobs: boolean;

  // Test set CRUD
  selectTestFileSet: (id: string) => void;
  createTestFileSet: (name: string) => void;
  renameTestFileSet: (id: string, name: string) => void;
  deleteTestFileSet: (id: string) => void;
  saveTestFileSet: (id: string) => Promise<void>;
  setSelectedPreviewFileId: (id: string | null) => void;
  addFilesToTestSet: (files: File[]) => void;
  removeFileFromTestSet: (fileId: string) => void;

  // Reference set CRUD
  selectReferenceFileSet: (id: string) => void;
  createReferenceFileSet: (name: string) => void;
  renameReferenceFileSet: (id: string, name: string) => void;
  deleteReferenceFileSet: (id: string) => void;
  saveReferenceFileSet: (id: string) => Promise<void>;
  setSelectedReferenceFileId: (id: string | null) => void;
  addFilesToReferenceSet: (files: File[]) => void;
  removeFileFromReferenceSet: (fileId: string) => void;

  // Blob accessors
  getTestFileBlob: (id: string) => File | null;
  getFileBlob: (id: string) => File | null;
  getAllTestFileBlobs: () => File[];
  getAllReferenceFileBlobs: () => File[];
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useProFileState(): ProFileState {
  const fileBlobsRef = useRef<Map<string, File>>(new Map());

  // Test set state
  const [testFileSets, setTestFileSets] = useState<TestFileSet[]>(
    INITIAL_TEST_FILE_SETS,
  );
  const [selectedTestFileSetId, setSelectedTestFileSetId] = useState<string>(
    INITIAL_TEST_FILE_SETS[0].id,
  );
  const [selectedPreviewFileId, setSelectedPreviewFileId] = useState<
    string | null
  >(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reference set state
  const [referenceFileSets, setReferenceFileSets] = useState<ReferenceFileSet[]>(
    INITIAL_REF_FILE_SETS,
  );
  const [selectedReferenceFileSetId, setSelectedReferenceFileSetId] =
    useState<string>(INITIAL_REF_FILE_SETS[0].id);
  const [selectedReferenceFileId, setSelectedReferenceFileId] = useState<
    string | null
  >(null);
  const [savingReferenceSet, setSavingReferenceSet] = useState(false);
  const [referenceSetSaveError, setReferenceSetSaveError] = useState<
    string | null
  >(null);

  // Shared loading state
  const [setsLoading, setSetsLoading] = useState(true);
  const [loadingSetBlobs, setLoadingSetBlobs] = useState(false);

  // Derived values
  const activeTestFileSet =
    testFileSets.find((s) => s.id === selectedTestFileSetId) ?? testFileSets[0];

  const selectedPreviewFile =
    activeTestFileSet?.files.find((f) => f.id === selectedPreviewFileId) ??
    null;

  const activeReferenceFileSet =
    referenceFileSets.find((s) => s.id === selectedReferenceFileSetId) ??
    referenceFileSets[0];

  const referenceFiles = activeReferenceFileSet?.files ?? [];

  const selectedReferenceFile =
    referenceFiles.find((f) => f.id === selectedReferenceFileId) ?? null;

  // Blob pre-fetch helpers
  const prefetchBlobsRef = useRef<(set: TestFileSet) => void>(() => {});
  prefetchBlobsRef.current = (set: TestFileSet) => {
    if (!set.savedId) return;
    const missing = set.files.filter(
      (f) => f.serverId && !fileBlobsRef.current.has(f.id),
    );
    if (missing.length === 0) return;
    setLoadingSetBlobs(true);
    Promise.all(
      missing.map((f) =>
        fetchFileBlob(set.savedId!, f.serverId!, f.name)
          .then((blob) => { fileBlobsRef.current.set(f.id, blob); })
          .catch(() => {}),
      ),
    ).finally(() => setLoadingSetBlobs(false));
  };

  const prefetchRefBlobsRef = useRef<(set: ReferenceFileSet) => void>(() => {});
  prefetchRefBlobsRef.current = (set: ReferenceFileSet) => {
    if (!set.savedId) return;
    const missing = set.files.filter(
      (f) => f.serverId && !fileBlobsRef.current.has(f.id),
    );
    if (missing.length === 0) return;
    Promise.all(
      missing.map((f) =>
        fetchReferenceFileBlob(set.savedId!, f.serverId!, f.name)
          .then((blob) => { fileBlobsRef.current.set(f.id, blob); })
          .catch(() => {}),
      ),
    );
  };

  // Initialise from backend on mount
  useEffect(() => {
    setSetsLoading(true);
    Promise.allSettled([listTestFileSets(), listReferenceFileSets()])
      .then(([testResult, refResult]) => {
        if (testResult.status === "fulfilled") {
          const saved = testResult.value;
          if (saved.length > 0) {
            const local = saved.map(savedToLocal);
            setTestFileSets(local);
            setSelectedTestFileSetId(local[0].id);
            setSelectedPreviewFileId(local[0].files[0]?.id ?? null);
            prefetchBlobsRef.current(local[0]);
          }
        }
        if (refResult.status === "fulfilled") {
          const saved = refResult.value;
          if (saved.length > 0) {
            const local = saved.map(savedRefToLocal);
            setReferenceFileSets(local);
            setSelectedReferenceFileSetId(local[0].id);
            setSelectedReferenceFileId(local[0].files[0]?.id ?? null);
            prefetchRefBlobsRef.current(local[0]);
          }
        }
      })
      .finally(() => setSetsLoading(false));
  }, []);

  // Test set CRUD
  const selectTestFileSet = useCallback(
    (id: string) => {
      setSelectedTestFileSetId(id);
      const set = testFileSets.find((s) => s.id === id);
      setSelectedPreviewFileId(set?.files[0]?.id ?? null);
      if (set) prefetchBlobsRef.current(set);
    },
    [testFileSets],
  );

  const createTestFileSet = useCallback((name: string) => {
    const newSet: TestFileSet = {
      id: `tfs-${uid()}`,
      name: name.trim() || "New Set",
      files: [],
      isDirty: false,
    };
    setTestFileSets((prev) => [...prev, newSet]);
    setSelectedTestFileSetId(newSet.id);
    setSelectedPreviewFileId(null);
  }, []);

  const renameTestFileSet = useCallback((id: string, name: string) => {
    setTestFileSets((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.name, isDirty: true } : s,
      ),
    );
  }, []);

  const deleteTestFileSet = useCallback(
    (id: string) => {
      const set = testFileSets.find((s) => s.id === id);
      if (set?.savedId) {
        apiDeleteTestFileSet(set.savedId).catch(() => {});
      }
      setTestFileSets((prev) => {
        const next = prev.filter((s) => s.id !== id);
        return next.length > 0 ? next : prev;
      });
      setSelectedTestFileSetId((prevId) => {
        if (prevId !== id) return prevId;
        const remaining = testFileSets.filter((s) => s.id !== id);
        if (remaining.length === 0) return prevId;
        const deletedIdx = testFileSets.findIndex((s) => s.id === id);
        return remaining[Math.max(0, deletedIdx - 1)].id;
      });
      setSelectedPreviewFileId(null);
    },
    [testFileSets],
  );

  const saveTestFileSet = useCallback(
    async (id: string): Promise<void> => {
      const set = testFileSets.find((s) => s.id === id);
      if (!set) return;
      setSaving(true);
      setSaveError(null);
      try {
        const keptFiles = set.files.filter((f) => f.serverId);
        const newLocalFiles = set.files.filter((f) => !f.serverId);
        const keepFileIds = keptFiles.map((f) => f.serverId!);
        const newBlobs: File[] = newLocalFiles.flatMap((f) => {
          const blob = fileBlobsRef.current.get(f.id);
          return blob ? [blob] : [];
        });
        let response: SavedTestFileSet;
        if (!set.savedId) {
          const allBlobs = set.files.flatMap((f) => {
            const blob = fileBlobsRef.current.get(f.id);
            return blob ? [blob] : [];
          });
          response = await apiCreateTestFileSet(set.name, allBlobs);
        } else {
          response = await apiUpdateTestFileSet(set.savedId, set.name, keepFileIds, newBlobs);
        }
        const backendNewFiles = response.files.filter((f) => !keepFileIds.includes(f.id));
        let newIdx = 0;
        const updatedFiles: ProFile[] = set.files.map((f) => {
          if (f.serverId && keepFileIds.includes(f.serverId)) return f;
          const bfi = backendNewFiles[newIdx++];
          if (!bfi) return f;
          return { ...f, serverId: bfi.id };
        });
        setTestFileSets((prev) =>
          prev.map((s) =>
            s.id === id ? { ...s, savedId: response.id, isDirty: false, files: updatedFiles } : s,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setSaveError(msg);
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [testFileSets],
  );

  // File CRUD within test set
  const addFilesToTestSet = useCallback(
    (rawFiles: File[]) => {
      const newFiles: ProFile[] = rawFiles.map((f) => ({
        id: `tf-${uid()}`,
        name: f.name,
        kind: detectFileKind(f),
        size: f.size,
        previewUrl: f.type.startsWith("image/") || f.type === "application/pdf" ? URL.createObjectURL(f) : null,
        status: "ready" as FileStatus,
        sourceKind: "test" as const,
      }));
      newFiles.forEach((pf, i) => fileBlobsRef.current.set(pf.id, rawFiles[i]));
      setTestFileSets((prev) =>
        prev.map((s) =>
          s.id === selectedTestFileSetId
            ? { ...s, files: [...s.files, ...newFiles], isDirty: true }
            : s,
        ),
      );
      if (newFiles.length > 0) setSelectedPreviewFileId(newFiles[0].id);
    },
    [selectedTestFileSetId],
  );

  const removeFileFromTestSet = useCallback(
    (fileId: string) => {
      const currentSet = testFileSets.find((s) => s.id === selectedTestFileSetId);
      const remaining = currentSet?.files.filter((f) => f.id !== fileId) ?? [];
      const deletedIdx = currentSet?.files.findIndex((f) => f.id === fileId) ?? -1;
      setTestFileSets((prev) =>
        prev.map((s) =>
          s.id === selectedTestFileSetId
            ? { ...s, files: s.files.filter((f) => f.id !== fileId), isDirty: true }
            : s,
        ),
      );
      fileBlobsRef.current.delete(fileId);
      setSelectedPreviewFileId((prev) => {
        if (prev !== fileId) return prev;
        if (remaining.length === 0) return null;
        return remaining[Math.max(0, deletedIdx - 1)].id;
      });
    },
    [selectedTestFileSetId, testFileSets],
  );

  // Reference set CRUD
  const selectReferenceFileSet = useCallback(
    (id: string) => {
      setSelectedReferenceFileSetId(id);
      const set = referenceFileSets.find((s) => s.id === id);
      setSelectedReferenceFileId(set?.files[0]?.id ?? null);
      if (set) prefetchRefBlobsRef.current(set);
    },
    [referenceFileSets],
  );

  const createReferenceFileSet = useCallback((name: string) => {
    const newSet: ReferenceFileSet = {
      id: `rfs-${uid()}`,
      name: name.trim() || "New Reference Set",
      files: [],
      isDirty: false,
    };
    setReferenceFileSets((prev) => [...prev, newSet]);
    setSelectedReferenceFileSetId(newSet.id);
    setSelectedReferenceFileId(null);
  }, []);

  const renameReferenceFileSet = useCallback((id: string, name: string) => {
    setReferenceFileSets((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, name: name.trim() || s.name, isDirty: true } : s,
      ),
    );
  }, []);

  const deleteReferenceFileSet = useCallback(
    (id: string) => {
      const set = referenceFileSets.find((s) => s.id === id);
      if (set?.savedId) {
        apiDeleteReferenceFileSet(set.savedId).catch(() => {});
      }
      setReferenceFileSets((prev) => {
        const next = prev.filter((s) => s.id !== id);
        return next.length > 0 ? next : prev;
      });
      setSelectedReferenceFileSetId((prevId) => {
        if (prevId !== id) return prevId;
        const remaining = referenceFileSets.filter((s) => s.id !== id);
        if (remaining.length === 0) return prevId;
        const deletedIdx = referenceFileSets.findIndex((s) => s.id === id);
        return remaining[Math.max(0, deletedIdx - 1)].id;
      });
      setSelectedReferenceFileId(null);
    },
    [referenceFileSets],
  );

  const saveReferenceFileSet = useCallback(
    async (id: string): Promise<void> => {
      const set = referenceFileSets.find((s) => s.id === id);
      if (!set) return;
      setSavingReferenceSet(true);
      setReferenceSetSaveError(null);
      try {
        const keptFiles = set.files.filter((f) => f.serverId);
        const newLocalFiles = set.files.filter((f) => !f.serverId);
        const keepFileIds = keptFiles.map((f) => f.serverId!);
        const newBlobs: File[] = newLocalFiles.flatMap((f) => {
          const blob = fileBlobsRef.current.get(f.id);
          return blob ? [blob] : [];
        });
        let response: SavedReferenceFileSet;
        if (!set.savedId) {
          const allBlobs = set.files.flatMap((f) => {
            const blob = fileBlobsRef.current.get(f.id);
            return blob ? [blob] : [];
          });
          response = await apiCreateReferenceFileSet(set.name, allBlobs);
        } else {
          response = await apiUpdateReferenceFileSet(set.savedId, set.name, keepFileIds, newBlobs);
        }
        const backendNewFiles = response.files.filter((f) => !keepFileIds.includes(f.id));
        let newIdx = 0;
        const updatedFiles: ProFile[] = set.files.map((f) => {
          if (f.serverId && keepFileIds.includes(f.serverId)) return f;
          const bfi = backendNewFiles[newIdx++];
          if (!bfi) return f;
          return { ...f, serverId: bfi.id };
        });
        setReferenceFileSets((prev) =>
          prev.map((s) =>
            s.id === id
              ? { ...s, savedId: response.id, isDirty: false, files: updatedFiles }
              : s,
          ),
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Save failed";
        setReferenceSetSaveError(msg);
        throw err;
      } finally {
        setSavingReferenceSet(false);
      }
    },
    [referenceFileSets],
  );

  // File CRUD within reference set
  const addFilesToReferenceSet = useCallback(
    (rawFiles: File[]) => {
      const newFiles: ProFile[] = rawFiles.map((f) => ({
        id: `rf-${uid()}`,
        name: f.name,
        kind: detectFileKind(f),
        size: f.size,
        previewUrl: f.type.startsWith("image/") || f.type === "application/pdf" ? URL.createObjectURL(f) : null,
        status: "ready" as FileStatus,
        sourceKind: "reference" as const,
      }));
      newFiles.forEach((pf, i) => fileBlobsRef.current.set(pf.id, rawFiles[i]));
      setReferenceFileSets((prev) =>
        prev.map((s) =>
          s.id === selectedReferenceFileSetId
            ? { ...s, files: [...s.files, ...newFiles], isDirty: true }
            : s,
        ),
      );
      if (newFiles.length > 0) setSelectedReferenceFileId(newFiles[0].id);
    },
    [selectedReferenceFileSetId],
  );

  const removeFileFromReferenceSet = useCallback(
    (fileId: string) => {
      const currentSet = referenceFileSets.find((s) => s.id === selectedReferenceFileSetId);
      const remaining = currentSet?.files.filter((f) => f.id !== fileId) ?? [];
      const deletedIdx = currentSet?.files.findIndex((f) => f.id === fileId) ?? -1;
      fileBlobsRef.current.delete(fileId);
      setReferenceFileSets((prev) =>
        prev.map((s) =>
          s.id === selectedReferenceFileSetId
            ? { ...s, files: s.files.filter((f) => f.id !== fileId), isDirty: true }
            : s,
        ),
      );
      setSelectedReferenceFileId((prev) => {
        if (prev !== fileId) return prev;
        if (remaining.length === 0) return null;
        return remaining[Math.max(0, deletedIdx - 1)].id;
      });
    },
    [selectedReferenceFileSetId, referenceFileSets],
  );

  // Blob accessors
  const getTestFileBlob = useCallback(
    (id: string): File | null => fileBlobsRef.current.get(id) ?? null,
    [],
  );

  const getFileBlob = useCallback(
    (id: string): File | null => fileBlobsRef.current.get(id) ?? null,
    [],
  );

  const getAllTestFileBlobs = useCallback((): File[] => {
    const activeSet = testFileSets.find((s) => s.id === selectedTestFileSetId) ?? testFileSets[0];
    return (activeSet?.files ?? []).flatMap((pf) => {
      const blob = fileBlobsRef.current.get(pf.id);
      return blob ? [blob] : [];
    });
  }, [testFileSets, selectedTestFileSetId]);

  const getAllReferenceFileBlobs = useCallback((): File[] => {
    const activeSet =
      referenceFileSets.find((s) => s.id === selectedReferenceFileSetId) ?? referenceFileSets[0];
    return (activeSet?.files ?? []).flatMap((pf) => {
      const blob = fileBlobsRef.current.get(pf.id);
      return blob ? [blob] : [];
    });
  }, [referenceFileSets, selectedReferenceFileSetId]);

  return {
    testFileSets,
    selectedTestFileSetId,
    activeTestFileSet,
    selectedPreviewFileId,
    selectedPreviewFile,
    referenceFileSets,
    selectedReferenceFileSetId,
    activeReferenceFileSet,
    referenceFiles,
    selectedReferenceFileId,
    selectedReferenceFile,
    setsLoading,
    saving,
    saveError,
    savingReferenceSet,
    referenceSetSaveError,
    loadingSetBlobs,
    selectTestFileSet,
    createTestFileSet,
    renameTestFileSet,
    deleteTestFileSet,
    saveTestFileSet,
    setSelectedPreviewFileId,
    addFilesToTestSet,
    removeFileFromTestSet,
    selectReferenceFileSet,
    createReferenceFileSet,
    renameReferenceFileSet,
    deleteReferenceFileSet,
    saveReferenceFileSet,
    setSelectedReferenceFileId,
    addFilesToReferenceSet,
    removeFileFromReferenceSet,
    getTestFileBlob,
    getFileBlob,
    getAllTestFileBlobs,
    getAllReferenceFileBlobs,
  };
}
