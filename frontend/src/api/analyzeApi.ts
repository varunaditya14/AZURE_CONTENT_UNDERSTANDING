import type { AnalyzeResponse, ErrorResponse } from "../types/analysis";

const BASE_URL = import.meta.env.VITE_API_BASE_URL as string;

if (!BASE_URL) {
  console.warn(
    "[analyzeApi] VITE_API_BASE_URL is not set. Requests will fail.",
  );
}

export async function analyzeFile(file: File): Promise<AnalyzeResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(`${BASE_URL}/analyze`, {
    method: "POST",
    body: formData,
  });

  const data: AnalyzeResponse | ErrorResponse = await response.json();

  if (!response.ok || !data.success) {
    const err = data as ErrorResponse;
    const message = err.error ?? `Request failed (HTTP ${response.status})`;
    const detail = err.detail ?? undefined;
    throw Object.assign(new Error(message), { detail });
  }

  return data as AnalyzeResponse;
}
