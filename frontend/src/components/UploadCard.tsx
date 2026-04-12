import { useRef, useState, useCallback, useEffect } from "react";
import { isSupportedFile, resolveFileCategory } from "../utils/fileRouting";

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

interface UploadCardProps {
  onFileSelected: (file: File) => void;
  onReset: () => void;
  isLoading: boolean;
}

export default function UploadCard({
  onFileSelected,
  onReset,
  isLoading,
}: UploadCardProps) {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /* Revoke object URL when it changes or component unmounts */
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleFile = useCallback((file: File) => {
    if (!isSupportedFile(file)) {
      setValidationError(
        `"${file.name}" is not supported. Upload a PDF or image (JPEG, PNG, TIFF, BMP, WebP).`,
      );
      return;
    }
    setValidationError(null);
    setSelectedFile(file);
    if (file.type.startsWith("image/")) {
      setPreviewUrl(URL.createObjectURL(file));
    } else {
      setPreviewUrl(null);
    }
  }, []);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }

  function handleAnalyze() {
    if (selectedFile) onFileSelected(selectedFile);
  }

  function handleClear() {
    setSelectedFile(null);
    setValidationError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (inputRef.current) inputRef.current.value = "";
    onReset();
  }

  const category = selectedFile ? resolveFileCategory(selectedFile) : null;

  return (
    <div className="bg-white border border-[#e5e4e2] rounded-2xl shadow-sm overflow-hidden">
      {/* Drop zone */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !selectedFile && inputRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-xl m-4 transition-all duration-200 text-center",
          dragOver
            ? "border-[#f05742] bg-[#f05742]/5 cursor-copy p-10"
            : selectedFile
              ? "border-[#f05742]/30 bg-[#f05742]/5 cursor-default p-6"
              : "border-[#e5e4e2] hover:border-[#f05742]/40 hover:bg-[#f05742]/5 cursor-pointer p-10",
        ].join(" ")}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.heif,.heic,.webp"
          className="hidden"
          onChange={handleInputChange}
        />

        {/* Drag-over overlay */}
        {dragOver && (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#f05742]/20 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-[#f05742]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <p className="font-semibold text-[#f05742]">Drop to analyze</p>
          </div>
        )}

        {/* File selected */}
        {!dragOver && selectedFile && (
          <div className="flex flex-col items-center gap-4">
            {/* Image preview thumbnail */}
            {previewUrl && (
              <div className="w-full max-w-xs mx-auto">
                <img
                  src={previewUrl}
                  alt="Preview"
                  className="max-h-40 w-auto mx-auto rounded-lg border border-[#e5e4e2] object-contain shadow-sm"
                />
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#f05742]/10 flex items-center justify-center flex-shrink-0">
                {category === "pdf" ? (
                  <svg
                    className="w-5 h-5 text-[#f05742]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 12h6M9 16h6M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z"
                    />
                  </svg>
                ) : (
                  <svg
                    className="w-5 h-5 text-[#f05742]"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"
                    />
                  </svg>
                )}
              </div>
              <div className="text-left min-w-0">
                <p className="font-medium text-[#1a1a18] leading-tight truncate max-w-[220px]">
                  {selectedFile.name}
                </p>
                <p className="text-xs text-[#6b6b68] mt-0.5">
                  {formatSize(selectedFile.size)} &middot;{" "}
                  {category?.toUpperCase()}
                </p>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="text-xs text-[#6b6b68] hover:text-[#f05742] transition-colors underline"
            >
              Remove file
            </button>
          </div>
        )}

        {/* Empty drop zone */}
        {!dragOver && !selectedFile && (
          <div className="flex flex-col items-center gap-3 text-[#6b6b68]">
            <div className="w-14 h-14 rounded-full bg-[#f05742]/10 flex items-center justify-center">
              <svg
                className="w-7 h-7 text-[#f05742]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                />
              </svg>
            </div>
            <div>
              <p className="font-semibold text-[#1a1a18]">
                Drop a file here, or click to browse
              </p>
              <p className="text-sm mt-1">
                PDF, JPEG, PNG, TIFF, BMP, WebP &middot; Max 20 MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="mx-4 mb-3 px-4 py-2.5 rounded-lg bg-[#dc2626]/5 border border-[#dc2626]/20 text-sm text-[#dc2626] flex items-center gap-2">
          <svg
            className="w-4 h-4 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
          {validationError}
        </div>
      )}

      {/* Footer action row */}
      <div className="px-4 pb-4 flex items-center justify-end gap-3">
        {selectedFile && (
          <button
            onClick={handleClear}
            disabled={isLoading}
            className="px-4 py-2 text-sm text-[#6b6b68] hover:text-[#1a1a18] rounded-lg transition-colors disabled:opacity-40"
          >
            Clear
          </button>
        )}
        <button
          onClick={handleAnalyze}
          disabled={!selectedFile || isLoading}
          className="px-6 py-2 text-sm font-semibold text-white rounded-lg bg-[#f05742] hover:bg-[#d94332] active:bg-[#c03020] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
        >
          {isLoading ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Analyzing…
            </>
          ) : (
            <>
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M13 10V3L4 14h7v7l9-11h-7z"
                />
              </svg>
              Analyze
            </>
          )}
        </button>
      </div>
    </div>
  );
}
