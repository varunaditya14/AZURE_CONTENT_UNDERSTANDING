export const FILE_STATUSES = [
  "idle",
  "ready",
  "analyzing",
  "done",
  "error",
] as const;

export type FileStatus = (typeof FILE_STATUSES)[number];
export type FileKind = "pdf" | "image" | "docx" | "txt" | "other";

/** A single file — either a test file or a reference file. */
export interface ProFile {
  id: string;
  name: string;
  kind: FileKind;
  size: number; // bytes
  previewUrl: string | null; // object URL for browser-uploaded images; null for others
  status: FileStatus;
  sourceKind: "test" | "reference";
  /** Backend file ID — set only for files that have been saved to the backend. */
  serverId?: string;
}

/** A named collection of test files. */
export interface TestFileSet {
  id: string;
  name: string;
  files: ProFile[];
  /** Backend set ID — set only for sets that have been saved to the backend. */
  savedId?: string;
  /** True when local state has changed since the last successful save. */
  isDirty: boolean;
}

/** A named collection of reference files. Same structure as TestFileSet. */
export interface ReferenceFileSet {
  id: string;
  name: string;
  files: ProFile[];
  /** Backend set ID — set only for sets that have been saved to the backend. */
  savedId?: string;
  /** True when local state has changed since the last successful save. */
  isDirty: boolean;
}
