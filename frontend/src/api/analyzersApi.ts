// Pro-mode analyzer listing, detail, and save (create/update).
// Calls GET/PUT /pro/analyzers[/{id}] — never touches Standard endpoints.
import type {
  RemoteAnalyzerDetail,
  RemoteAnalyzerListItem,
} from "../types/remoteAnalyzer";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

export async function listAnalyzers(): Promise<RemoteAnalyzerListItem[]> {
  const res = await fetch(`${BASE_URL}/pro/analyzers`);
  if (!res.ok) {
    throw new Error(`Failed to list Pro analyzers (HTTP ${res.status})`);
  }
  return res.json() as Promise<RemoteAnalyzerListItem[]>;
}

export async function getAnalyzerDetail(
  id: string,
): Promise<RemoteAnalyzerDetail> {
  const res = await fetch(
    `${BASE_URL}/pro/analyzers/${encodeURIComponent(id)}`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load Pro analyzer "${id}" (HTTP ${res.status})`);
  }
  return res.json() as Promise<RemoteAnalyzerDetail>;
}

// ---------------------------------------------------------------------------
// Analyzer save (create or update) — PUT /pro/analyzers/{id}
// ---------------------------------------------------------------------------

export interface SaveAnalyzerFieldInput {
  name: string;
  description: string;
  type: string; // lowercase: string | number | date | boolean | array
  method: string; // lowercase: extract | classify | generate
  /** Raw items object for array fields — preserved opaquely from GET response. */
  items_def?: Record<string, unknown> | null;
}

export interface SaveAnalyzerPayload {
  description: string;
  schema_name: string;
  schema_description: string;
  fields: SaveAnalyzerFieldInput[];
}

/**
 * Create (new id) or update (existing id) a Pro analyzer.
 * Waits for the Azure CU LRO build to complete before resolving.
 */
export async function saveAnalyzer(
  id: string,
  payload: SaveAnalyzerPayload,
): Promise<RemoteAnalyzerDetail> {
  const res = await fetch(
    `${BASE_URL}/pro/analyzers/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { detail?: string };
      detail = err.detail ?? "";
    } catch {
      /* ignore parse errors */
    }
    throw new Error(
      `Failed to save analyzer "${id}" (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json() as Promise<RemoteAnalyzerDetail>;
}

// ---------------------------------------------------------------------------
// Analyzer delete — DELETE /pro/analyzers/{id}
// ---------------------------------------------------------------------------

/**
 * Permanently delete a Pro analyzer.
 * Resolves on success (204), rejects with Error on failure.
 */
export async function deleteAnalyzer(id: string): Promise<void> {
  const res = await fetch(
    `${BASE_URL}/pro/analyzers/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );
  if (!res.ok) {
    let detail = "";
    try {
      const err = (await res.json()) as { detail?: string };
      detail = err.detail ?? "";
    } catch {
      /* ignore parse errors */
    }
    throw new Error(
      `Failed to delete analyzer "${id}" (HTTP ${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
}
