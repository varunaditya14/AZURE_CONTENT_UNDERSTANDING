/** Returns a human-readable analyzer label based on file type string. */
export function getAnalyzerLabel(fileType: string): string {
  if (fileType === "pdf") return "Document Analyzer";
  if (fileType === "image") return "Image Analyzer";
  if (fileType === "audio") return "Audio Analyzer";
  if (fileType === "video") return "Video Analyzer";
  return "Content Analyzer";
}

// ---------------------------------------------------------------------------
// Canonical extension lists per category.
// These are the single source of truth for the frontend.
// _SUPPORTED_EXTS, ACCEPTED_EXTENSIONS_ATTR, FORMAT_GROUPS, and
// resolveFileCategory all derive from these — add a new format only here.
// ---------------------------------------------------------------------------

const _IMAGE_EXTS = [
  "jpg",
  "jpeg",
  "png",
  "tiff",
  "tif",
  "bmp",
  "heif",
  "heic",
  "webp",
] as const;

const _AUDIO_EXTS = ["mp3", "wav", "ogg", "flac", "aac", "m4a"] as const;

const _VIDEO_EXTS = ["mp4", "mov", "avi", "mkv", "webm"] as const;

const _SUPPORTED_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/bmp",
  "image/heif",
  "image/webp",
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
  "video/mp4",
  "video/mpeg",
  "video/quicktime",
  "video/webm",
  "video/x-msvideo",
  "video/x-matroska",
]);

const _SUPPORTED_EXTS = new Set([
  "pdf",
  ..._IMAGE_EXTS,
  ..._AUDIO_EXTS,
  ..._VIDEO_EXTS,
]);

/**
 * Comma-separated extension list for the HTML <input accept="..."> attribute.
 * Derived from _SUPPORTED_EXTS — no need to maintain separately.
 */
export const ACCEPTED_EXTENSIONS_ATTR: string = [..._SUPPORTED_EXTS]
  .map((e) => `.${e}`)
  .join(",");

/**
 * Human-readable format groups used for hint text and error messages in the UI.
 * UploadCard derives all visible format text from this object.
 */
export const FORMAT_GROUPS = {
  document: ["PDF"],
  image: ["JPEG", "PNG", "TIFF", "BMP", "WebP"],
  audio: ["MP3", "WAV", "OGG", "FLAC", "AAC", "M4A"],
  video: ["MP4", "MOV", "AVI", "MKV", "WebM"],
} as const;

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
    (_IMAGE_EXTS as readonly string[]).includes(ext)
  )
    return "image";
  if (
    mime.startsWith("audio/") ||
    (_AUDIO_EXTS as readonly string[]).includes(ext)
  )
    return "audio";
  if (
    mime.startsWith("video/") ||
    (_VIDEO_EXTS as readonly string[]).includes(ext)
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
