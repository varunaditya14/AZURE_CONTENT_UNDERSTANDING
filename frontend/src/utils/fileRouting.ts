/** Returns a human-readable analyzer label based on file type string. */
export function getAnalyzerLabel(fileType: string): string {
  if (fileType === "pdf") return "Document Analyzer";
  if (fileType === "image") return "Image Analyzer";
  if (fileType === "audio") return "Audio Analyzer";
  if (fileType === "video") return "Video Analyzer";
  return "Content Analyzer";
}

const _SUPPORTED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heif",
  "image/webp",
  // Audio
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/flac",
  "audio/aac",
  "audio/x-aac",
  "audio/webm",
  "audio/x-m4a",
  // Video
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
]);

const _SUPPORTED_EXTS = new Set([
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
  // Audio
  "mp3",
  "wav",
  "ogg",
  "flac",
  "aac",
  "m4a",
  // Video
  "mp4",
  "mov",
  "avi",
  "mkv",
  "webm",
]);

/** Returns true if the file type is supported by the backend. */
export function isSupportedFile(file: File): boolean {
  const mime = file.type.toLowerCase();
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return _SUPPORTED_MIMES.has(mime) || _SUPPORTED_EXTS.has(ext);
}

/** Broad file category returned from resolveFileCategory. */
export type FileCategory = "pdf" | "image" | "audio" | "video" | "unknown";

/** Returns the broad file category based on the file. */
export function resolveFileCategory(file: File): FileCategory {
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
  if (
    mime.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "flac", "aac", "m4a"].includes(ext)
  )
    return "audio";
  if (
    mime.startsWith("video/") ||
    ["mp4", "mov", "avi", "mkv", "webm"].includes(ext)
  )
    return "video";
  return "unknown";
}

// ---------------------------------------------------------------------------
// Modality — coarser than file category; drives UI layout decisions
// ---------------------------------------------------------------------------

export type Modality = "document" | "image" | "audio" | "video";

/**
 * Map the server-returned file_type string to a UI modality.
 * "pdf" → "document"; "image" → "image"; "audio" → "audio"; "video" → "video".
 */
export function detectModality(fileType: string): Modality {
  if (fileType === "audio") return "audio";
  if (fileType === "video") return "video";
  if (fileType === "image") return "image";
  return "document";
}
