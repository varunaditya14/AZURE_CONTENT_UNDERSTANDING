import { useState, useCallback } from "react";
import type { AnalyzeResponse } from "../types/analysis";
import { analyzeFilesWithPro } from "../api/proAnalyzeApi";

export interface ProAnalysisState {
  /** True while a Pro analysis request is in flight. */
  running: boolean;
  /** Non-null when the last run failed; cleared on the next successful run. */
  error: string | null;
  /** Full response from the last successful Pro analysis run. */
  result: AnalyzeResponse | null;
  /**
   * Submit test files + reference files to the Pro analyze endpoint.
   * Both arrays are forwarded as a single multi-input request so the Foundry
   * analyzer can reason across all documents at once.
   *
   * When `savedTestFileSetId` is provided and `testFiles` is empty the backend
   * reads stored files from disk, enabling re-analysis without re-uploading.
   */
  runAnalysis: (
    testFiles: File[],
    referenceFiles: File[],
    analyzerId: string,
    savedTestFileSetId?: string,
    savedReferenceFileSetId?: string,
  ) => Promise<void>;
  /** Reset result and error back to their initial state. */
  clearResult: () => void;
}

export function useProAnalysis(): ProAnalysisState {
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const runAnalysis = useCallback(
    async (
      testFiles: File[],
      referenceFiles: File[],
      analyzerId: string,
      savedTestFileSetId?: string,
      savedReferenceFileSetId?: string,
    ) => {
      setRunning(true);
      setError(null);
      try {
        const response = await analyzeFilesWithPro(
          testFiles,
          referenceFiles,
          analyzerId,
          savedTestFileSetId,
          savedReferenceFileSetId,
        );
        setResult(response);
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "An unknown error occurred.";
        setError(msg);
      } finally {
        setRunning(false);
      }
    },
    [],
  );

  const clearResult = useCallback(() => {
    setResult(null);
    setError(null);
  }, []);

  return { running, error, result, runAnalysis, clearResult };
}
