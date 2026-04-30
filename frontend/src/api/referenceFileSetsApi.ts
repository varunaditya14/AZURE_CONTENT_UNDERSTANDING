// Pro-mode reference file sets API.
// Calls /pro/reference-file-sets — never touches Standard endpoints.

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

// ---------------------------------------------------------------------------
// Response shapes (mirrors backend TestFileItem / TestFileSetResponse)
// ---------------------------------------------------------------------------

export interface SavedFileItem {
  id: string;
  name: string;
  kind: string;
  size: number;
}

export interface SavedReferenceFileSet {
  id: string;
  name: string;
  files: SavedFileItem[];
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// API calls
// ---------------------------------------------------------------------------

export async function listReferenceFileSets(): Promise<
  SavedReferenceFileSet[]
> {
  const res = await fetch(`${BASE_URL}/pro/reference-file-sets`);
  if (!res.ok)
    throw new Error(`Failed to list reference file sets (HTTP ${res.status})`);
  return res.json() as Promise<SavedReferenceFileSet[]>;
}

export async function createReferenceFileSet(
  name: string,
  files: File[],
): Promise<SavedReferenceFileSet> {
  const fd = new FormData();
  fd.append("name", name);
  for (const f of files) fd.append("files", f);
  const res = await fetch(`${BASE_URL}/pro/reference-file-sets`, {
    method: "POST",
    body: fd,
  });
  if (!res.ok) {
    const msg = await _errorMessage(res);
    throw new Error(`Failed to create reference file set: ${msg}`);
  }
  return res.json() as Promise<SavedReferenceFileSet>;
}

export async function updateReferenceFileSet(
  id: string,
  name: string,
  keepFileIds: string[],
  newFiles: File[],
): Promise<SavedReferenceFileSet> {
  const fd = new FormData();
  fd.append("name", name);
  fd.append("keep_file_ids", JSON.stringify(keepFileIds));
  for (const f of newFiles) fd.append("new_files", f);
  const res = await fetch(
    `${BASE_URL}/pro/reference-file-sets/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: fd,
    },
  );
  if (!res.ok) {
    const msg = await _errorMessage(res);
    throw new Error(`Failed to update reference file set: ${msg}`);
  }
  return res.json() as Promise<SavedReferenceFileSet>;
}

export async function deleteReferenceFileSet(id: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/pro/reference-file-sets/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
  if (!res.ok && res.status !== 204) {
    throw new Error(`Failed to delete reference file set (HTTP ${res.status})`);
  }
}

/** Returns a URL that serves the raw bytes for a stored reference file (for browser preview). */
export function getReferenceFileUrl(setId: string, fileId: string): string {
  return `${BASE_URL}/pro/reference-file-sets/${encodeURIComponent(setId)}/files/${encodeURIComponent(fileId)}`;
}

/** Fetches the raw blob for a stored reference file for local preview or analysis upload. */
export async function fetchReferenceFileBlob(
  setId: string,
  fileId: string,
  fileName: string,
): Promise<File> {
  const res = await fetch(getReferenceFileUrl(setId, fileId));
  if (!res.ok)
    throw new Error(
      `Failed to fetch stored reference file (HTTP ${res.status})`,
    );
  const blob = await res.blob();
  return new File([blob], fileName, { type: blob.type });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function _errorMessage(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: string; error?: string };
    return body.detail ?? body.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}
