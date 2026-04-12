/** Returns a human-readable analyzer label based on file MIME or extension. */
export function getAnalyzerLabel(fileType: string): string {
  if (fileType === "pdf") return "Document Analyzer";
  if (fileType === "image") return "Image Analyzer";
  return "Unknown Analyzer";
}

/** Returns true if the file type is supported by the backend. */
export function isSupportedFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

  const supportedMimes = new Set([
    "application/pdf",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/tiff",
    "image/bmp",
    "image/heif",
    "image/webp",
  ]);
  const supportedExts = new Set([
    "pdf",
    "jpg",
    "jpeg",
    "png",
    "tiff",
    "tif",
    "bmp",
    "heif",
    "heic",
    "webp",
  ]);

  return supportedMimes.has(mime) || supportedExts.has(ext);
}

/** Returns "pdf" | "image" | "unknown" based on the file. */
export function resolveFileCategory(file: File): "pdf" | "image" | "unknown" {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (mime === "application/pdf" || ext === "pdf") return "pdf";
  if (
    mime.startsWith("image/") ||
    [
      "jpg",
      "jpeg",
      "png",
      "tiff",
      "tif",
      "bmp",
      "heif",
      "heic",
      "webp",
    ].includes(ext)
  )
    return "image";
  return "unknown";
}
