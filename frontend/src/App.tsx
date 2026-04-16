import { useState } from "react";
import { analyzeFile } from "./api/analyzeApi";
import type { AnalyzeResponse } from "./types/analysis";
import UploadCard from "./components/UploadCard";
import SplitReviewLayout from "./components/SplitReviewLayout";
import EmptyState from "./components/EmptyState";
import LoadingState from "./components/LoadingState";
import ErrorBanner from "./components/ErrorBanner";

type AppState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: AnalyzeResponse; uploadedFile: File }
  | { status: "error"; message: string; detail?: string };

export default function App() {
  const [state, setState] = useState<AppState>({ status: "idle" });
  const [selectedFieldName, setSelectedFieldName] = useState<string | null>(
    null,
  );

  async function handleFileSelected(file: File) {
    setSelectedFieldName(null);
    setState({ status: "loading" });
    try {
      const result = await analyzeFile(file);
      setState({ status: "success", result, uploadedFile: file });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      const detail = (err as { detail?: string }).detail;
      setState({ status: "error", message, detail });
    }
  }

  function handleReset() {
    setSelectedFieldName(null);
    setState({ status: "idle" });
  }

  return (
    <div className="min-h-screen bg-[#f9f9f8] flex flex-col">
      {/* Top accent bar */}
      <div className="h-0.5 bg-[#f05742]" />

      {/* Header */}
      <header className="bg-white border-b border-[#e5e4e2] sticky top-0 z-10">
        <div className="max-w-[1400px] mx-auto px-8 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#f05742] flex items-center justify-center shadow-sm">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-sm font-semibold text-[#1a1a18] leading-tight">
                Content Understanding
              </h1>
              <p className="text-xs text-[#6b6b68]">Azure AI · Demo</p>
            </div>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-[#6b6b68] border border-[#e5e4e2] rounded-full px-3 py-1 bg-white">
            <span className="w-1.5 h-1.5 rounded-full bg-[#059669] animate-pulse" />
            Live
          </span>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-8 py-10 space-y-7">
        {/* Hero */}
        <div className="text-center space-y-3 pb-2">
          <div className="inline-flex items-center gap-1.5 bg-[#f05742]/10 text-[#f05742] text-xs font-semibold px-3 py-1 rounded-full border border-[#f05742]/20">
            <svg
              className="w-3 h-3"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 10V3L4 14h7v7l9-11h-7z"
              />
            </svg>
            Powered by Azure AI
          </div>
          <h2 className="text-3xl font-bold text-[#1a1a18] tracking-tight">
            Document & Image Analysis
          </h2>
          <p className="text-[#6b6b68] max-w-md mx-auto leading-relaxed">
            Upload a PDF or image to extract structured fields using Azure
            Content Understanding.
          </p>
        </div>

        <UploadCard
          onFileSelected={handleFileSelected}
          onReset={handleReset}
          isLoading={state.status === "loading"}
        />

        {state.status === "error" && (
          <ErrorBanner
            message={state.message}
            detail={state.detail}
            onDismiss={handleReset}
          />
        )}

        {state.status === "loading" && <LoadingState />}

        {state.status === "idle" && <EmptyState />}

        {state.status === "success" && (
          <SplitReviewLayout
            result={state.result}
            uploadedFile={state.uploadedFile}
            selectedFieldName={selectedFieldName}
            onFieldSelect={setSelectedFieldName}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#e5e4e2] bg-white mt-auto">
        <div className="max-w-[1400px] mx-auto px-8 py-4 text-xs text-[#6b6b68] text-center">
          Azure Content Understanding Demo &middot; Structured field extraction
          via Azure AI
        </div>
      </footer>
    </div>
  );
}
