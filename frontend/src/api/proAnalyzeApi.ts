// Pro-mode file analysis.
// Calls POST /pro/analyze — never touches Standard endpoints.
import type { AnalyzeResponse, ErrorResponse } from "../types/analysis";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

/**
 * Submit one or more test files plus optional reference files to the Pro
 * analyze endpoint.  All files are forwarded to the Azure CU Foundry analyzer
 * as a multi-input JSON payload so the analyzer can reason across the full
 * document set.
 *
 * When `savedTestFileSetId` is provided and `testFiles` is empty the backend
 * reads the stored files from disk instead of requiring uploads, enabling
 * re-analysis without re-uploading.
 */
export async function analyzeFilesWithPro(
  testFiles: File[],
  referenceFiles: File[],
  analyzerId: string,
  savedTestFileSetId?: string,
  savedReferenceFileSetId?: string,
): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("analyzer_id", analyzerId);
  if (savedTestFileSetId) {
    formData.append("saved_test_file_set_id", savedTestFileSetId);
  }
  if (savedReferenceFileSetId) {
    formData.append("saved_reference_file_set_id", savedReferenceFileSetId);
  }
  for (const f of testFiles) {
    formData.append("test_files", f);
  }
  for (const f of referenceFiles) {
    formData.append("reference_files", f);
  }

  const response = await fetch(`${BASE_URL}/pro/analyze`, {
    method: "POST",
    body: formData,
  });

  const data: AnalyzeResponse | ErrorResponse = await response.json();

  if (!response.ok || !data.success) {
    const err = data as ErrorResponse;
    const message = err.error ?? `Pro analyze failed (HTTP ${response.status})`;
    const detail = err.detail ?? undefined;
    throw Object.assign(new Error(message), { detail });
  }

  return data as AnalyzeResponse;
}
