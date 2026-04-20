/**
 * Transcript extraction and timestamp parsing utilities.
 *
 * Azure Content Understanding audio/video results may carry transcript data
 * in various shapes depending on SDK version and analyzer configuration.
 * This module normalises those shapes into a flat TranscriptSegment[].
 *
 * Time values are always normalised to decimal seconds (number).
 */

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface TranscriptSegment {
  /** Stable id suitable for React key */
  id: string;
  /** Start time in seconds */
  startSec: number;
  /** End time in seconds */
  endSec: number;
  /** Transcript text for this segment */
  text: string;
  /** Optional speaker identifier / label */
  speaker?: string;
}

// ---------------------------------------------------------------------------
// Timestamp parsing
// ---------------------------------------------------------------------------

/**
 * Convert an Azure CU timestamp value to decimal seconds.
 *
 * Handled formats:
 * - number (already in seconds)
 * - ISO 8601 duration: "PT1H2M3.456S", "PT3.456S", "P0Y0M0DT0H0M3.456S"
 * - "H:MM:SS.mmm" / "HH:MM:SS.mmm"  →  "0:00:03.456" or "1:02:03"
 * - "MM:SS.mmm"                       →  "1:23.456"
 * - Plain decimal string:             →  "3.456"
 */
export function parseTimeToSeconds(t: unknown): number {
  if (typeof t === "number") return isNaN(t) ? 0 : t;
  if (typeof t !== "string") return 0;
  const s = t.trim();
  if (!s) return 0;

  // ISO 8601 duration: PT…H…M…S
  if (s.includes("T") && s.startsWith("P")) {
    let secs = 0;
    const h = s.match(/(\d+(?:\.\d+)?)H/);
    const m = s.match(/(\d+(?:\.\d+)?)M/);
    const sec = s.match(/(\d+(?:\.\d+)?)S/);
    if (h) secs += parseFloat(h[1]) * 3600;
    if (m) secs += parseFloat(m[1]) * 60;
    if (sec) secs += parseFloat(sec[1]);
    return secs;
  }

  // H:MM:SS.mmm or HH:MM:SS.mmm
  const hmsMatch = s.match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);
  if (hmsMatch) {
    return (
      parseInt(hmsMatch[1]) * 3600 +
      parseInt(hmsMatch[2]) * 60 +
      parseFloat(hmsMatch[3])
    );
  }

  // MM:SS.mmm
  const msMatch = s.match(/^(\d+):(\d{2}(?:\.\d+)?)$/);
  if (msMatch) {
    return parseInt(msMatch[1]) * 60 + parseFloat(msMatch[2]);
  }

  // Plain number string
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/**
 * Format decimal seconds as "M:SS" or "H:MM:SS".
 * Suitable for transcript timestamps and player time displays.
 */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return "0:00";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function readText(raw: Record<string, unknown>): string | null {
  for (const key of [
    "text",
    "content",
    "transcript",
    "displayText",
    "display_text",
  ]) {
    const v = raw[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

function readSpeaker(raw: Record<string, unknown>): string | undefined {
  for (const key of [
    "speakerLabel",
    "speaker_label",
    "speaker",
    "speakerId",
    "speaker_id",
    "channelNumber",
  ]) {
    const v = raw[key];
    if (v !== undefined && v !== null) return String(v);
  }
  return undefined;
}

function normaliseSegment(
  raw: Record<string, unknown>,
  idx: number,
): TranscriptSegment | null {
  const text = readText(raw);
  if (!text) return null;

  const startSec = parseTimeToSeconds(
    raw["startTime"] ?? raw["start_time"] ?? raw["offset"] ?? raw["start"] ?? 0,
  );
  const endSec = parseTimeToSeconds(
    raw["endTime"] ?? raw["end_time"] ?? raw["end"] ?? startSec + 1,
  );

  return {
    id: `seg-${idx}`,
    startSec,
    endSec: Math.max(endSec, startSec + 0.001),
    text,
    speaker: readSpeaker(raw),
  };
}

/**
 * Normalise an Azure CU valueObject (from a fields array item) into a segment.
 *
 * Target shape (prebuilt-callCenter / custom audio analyzers):
 *   {
 *     Text:        { type: "string", valueString: "Hello world" },
 *     StartTime:   { type: "string", valueString: "PT0S" },
 *     EndTime:     { type: "string", valueString: "PT3.456S" },
 *     SpeakerRole: { type: "string", valueString: "Agent" }
 *   }
 *
 * Field name matching uses lowercased substrings — not tied to any specific
 * analyzer schema.
 */
function normaliseValueObject(
  vo: Record<string, unknown>,
  idx: number,
): TranscriptSegment | null {
  let text: string | null = null;
  let startSec = 0;
  let endSec = 0;
  let speaker: string | undefined;

  for (const [key, raw] of Object.entries(vo)) {
    if (!raw || typeof raw !== "object") continue;
    const f = raw as Record<string, unknown>;

    // Resolve the scalar string value from this field object.
    // Azure CU uses "valueString"; some preview SDKs use "value_string" or "content".
    const strVal: string | null =
      typeof f["valueString"] === "string"
        ? f["valueString"]
        : typeof f["value_string"] === "string"
          ? f["value_string"]
          : typeof f["content"] === "string"
            ? f["content"]
            : null;

    if (strVal === null) continue;

    const kl = key.toLowerCase();

    if (
      kl === "text" ||
      kl === "content" ||
      kl === "transcription" ||
      kl === "displaytext"
    ) {
      if (strVal.trim()) text = strVal.trim();
    } else if (kl.includes("start")) {
      startSec = parseTimeToSeconds(strVal);
    } else if (kl.includes("end")) {
      endSec = parseTimeToSeconds(strVal);
    } else if (
      kl.includes("speaker") ||
      kl.includes("role") ||
      kl.includes("channel")
    ) {
      if (strVal.trim()) speaker = strVal.trim();
    } else if (!text && strVal.trim() && !/^PT/i.test(strVal.trim())) {
      // Generic fallback: first non-empty, non-ISO-duration string becomes text
      text = strVal.trim();
    }
  }

  if (!text) return null;

  return {
    id: `seg-${idx}`,
    startSec,
    endSec: Math.max(endSec, startSec + 0.001),
    text,
    speaker,
  };
}

/**
 * Pull candidate raw segment objects from the raw Azure CU result.
 * Checks multiple known key names and nesting levels.
 */
function gatherRawSegments(raw: Record<string, unknown>): unknown[] {
  const collected: unknown[] = [];

  function tryArray(arr: unknown, label?: string): boolean {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0] as Record<string, unknown>;
    const hasText =
      typeof first["text"] === "string" ||
      typeof first["content"] === "string" ||
      typeof first["transcript"] === "string" ||
      typeof first["displayText"] === "string";
    if (!hasText) return false;
    void label; // suppress unused warning
    collected.push(...arr);
    return true;
  }

  const SEGMENT_KEYS = [
    "segments",
    "utterances",
    "phrases",
    "captions",
    "words",
    "turns",
  ];

  // Top-level segment arrays
  for (const key of SEGMENT_KEYS) {
    tryArray(raw[key]);
  }

  // Nested in "transcription" object
  const transcription = raw["transcription"];
  if (transcription && typeof transcription === "object") {
    if (Array.isArray(transcription)) {
      tryArray(transcription);
    } else {
      const t = transcription as Record<string, unknown>;
      for (const key of SEGMENT_KEYS) {
        tryArray(t[key]);
      }
    }
  }

  // Nested in contents[] / documents[]
  for (const containerKey of ["contents", "documents"]) {
    const container = raw[containerKey];
    if (!Array.isArray(container)) continue;
    for (const block of container as Record<string, unknown>[]) {
      for (const key of SEGMENT_KEYS) {
        tryArray(block[key]);
      }
      // transcription sub-object inside block
      const t = block["transcription"];
      if (t && typeof t === "object") {
        if (Array.isArray(t)) {
          tryArray(t);
        } else {
          const tr = t as Record<string, unknown>;
          for (const key of SEGMENT_KEYS) {
            tryArray(tr[key]);
          }
        }
      }
    }
  }

  return collected;
}

// ---------------------------------------------------------------------------
// WEBVTT parsing — used by Azure prebuilt audio analyzers
// ---------------------------------------------------------------------------

/**
 * Parse a WEBVTT string into TranscriptSegment[].
 *
 * Handles two common speaker-identification conventions:
 *   - WebVTT voice tag:   <v Speaker Name>text
 *   - Plain label prefix: "Speaker 1: text"
 */
function parseWebVTT(webvtt: string): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];

  // Split on blank lines to isolate individual cue blocks
  const blocks = webvtt.split(/\n[ \t]*\n/);
  let idx = 0;

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    // Locate the timestamp line ("HH:MM:SS.mmm --> HH:MM:SS.mmm …")
    let timeLine = "";
    let textStart = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("-->")) {
        timeLine = lines[i];
        textStart = i + 1;
        break;
      }
    }
    if (!timeLine || textStart < 0 || textStart >= lines.length) continue;

    // Parse timestamps (comma or dot as decimal separator)
    const tsMatch = timeLine.match(
      /(\d{2}:\d{2}:\d{2}[.,]\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}[.,]\d{3})/,
    );
    if (!tsMatch) continue;

    const startSec = parseTimeToSeconds(tsMatch[1].replace(",", "."));
    const endSec = parseTimeToSeconds(tsMatch[2].replace(",", "."));

    // Join remaining lines into a single string
    const textLines = lines.slice(textStart).filter((l) => l.trim());
    if (textLines.length === 0) continue;
    const rawText = textLines.join(" ");

    // Detect speaker from WebVTT voice tag or plain "Label: text" prefix
    let speaker: string | undefined;
    let text = rawText;

    const voiceMatch = rawText.match(/^<v\s+([^>]+)>([\s\S]*)/);
    if (voiceMatch) {
      speaker = voiceMatch[1].trim();
      text = voiceMatch[2].trim();
    } else {
      // "Speaker Label: text" — limit label to ≤40 chars to avoid false matches
      const labelMatch = rawText.match(/^([A-Za-z][^:]{0,39}):\s+([\s\S]+)/);
      if (labelMatch) {
        speaker = labelMatch[1].trim();
        text = labelMatch[2].trim();
      }
    }

    if (!text.trim()) continue;

    segments.push({
      id: `webvtt-${idx}`,
      startSec,
      endSec: Math.max(endSec, startSec + 0.001),
      text,
      speaker,
    });
    idx++;
  }

  return segments;
}

/**
 * Return true and push `s` to `acc` when `s` looks like a WEBVTT document.
 * Accepts any string that starts with "WEBVTT" (case-insensitive) and contains
 * at least one timestamp "-->" marker.
 */
function tryCollectWebVTT(s: unknown, acc: string[]): boolean {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (/^WEBVTT/i.test(t) && t.includes("-->")) {
    acc.push(t);
    return true;
  }
  return false;
}

/**
 * Recursively walk a raw Azure CU result object and gather every string that
 * looks like a WEBVTT document into `acc`.
 *
 * Search order / locations checked:
 *   1. contents[].markdown / content / transcript (standard CU response)
 *   2. Any field value inside contents[].fields{} (prebuilt analyzers sometimes
 *      put the WEBVTT inside a Transcript / Caption / Content field)
 *   3. Top-level markdown, content, transcript, caption
 *   4. Top-level fields{} (symmetric with #2)
 *   5. Nested under a "result" wrapper key (some SDK wrapper shapes)
 */
function collectWebVTTCandidates(
  raw: Record<string, unknown>,
  acc: string[],
  depth = 0,
): void {
  if (depth > 3) return; // guard against infinite recursion

  // --- Check plain string fields at this level ---
  for (const key of ["markdown", "content", "transcript", "caption", "body"]) {
    tryCollectWebVTT(raw[key], acc);
  }

  // --- Check inside a "fields" object at this level ---
  const fields = raw["fields"];
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    for (const fieldVal of Object.values(fields as Record<string, unknown>)) {
      if (fieldVal && typeof fieldVal === "object") {
        const f = fieldVal as Record<string, unknown>;
        // valueString / value_string / content / value are common field value keys
        for (const vk of ["valueString", "value_string", "content", "value"]) {
          tryCollectWebVTT(f[vk], acc);
        }
      }
    }
  }

  // --- Recurse into arrays (contents[], documents[]) ---
  for (const containerKey of ["contents", "documents"]) {
    const container = raw[containerKey];
    if (Array.isArray(container)) {
      for (const block of container as Record<string, unknown>[]) {
        collectWebVTTCandidates(block, acc, depth + 1);
      }
    }
  }

  // --- Recurse into a nested "result" wrapper (some SDK shapes wrap the
  //     AnalyzeResult inside { status, result: { ... } }) ---
  if (depth === 0) {
    const nested = raw["result"];
    if (nested && typeof nested === "object" && !Array.isArray(nested)) {
      collectWebVTTCandidates(
        nested as Record<string, unknown>,
        acc,
        depth + 1,
      );
    }
  }
}

/**
 * Search the raw Azure CU result for any WEBVTT content and return parsed
 * segments. Returns an empty array when no WEBVTT data is found.
 */
function extractWebVTT(
  rawResult: Record<string, unknown>,
): TranscriptSegment[] {
  const candidates: string[] = [];
  collectWebVTTCandidates(rawResult, candidates);

  for (const webvtt of candidates) {
    const segs = parseWebVTT(webvtt);
    if (segs.length > 0) return segs;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Segment deduplication
// ---------------------------------------------------------------------------

/**
 * Remove adjacent duplicate segments.
 * Two segments are considered duplicates when their start times are within
 * 10 ms of each other AND their normalised texts are identical.
 *
 * Handles chunked WEBVTT transcripts where the same cue may appear at the
 * end of one block and the start of the next.
 */
function deduplicateSegments(segs: TranscriptSegment[]): TranscriptSegment[] {
  if (segs.length <= 1) return segs;
  const out: TranscriptSegment[] = [segs[0]];
  for (let i = 1; i < segs.length; i++) {
    const prev = out[out.length - 1];
    const curr = segs[i];
    const sameTime = Math.abs(curr.startSec - prev.startSec) < 0.01;
    const sameText = curr.text.trim() === prev.text.trim();
    if (sameTime && sameText) continue;
    out.push(curr);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Primary audio/video transcript source: contents[*].markdown
// ---------------------------------------------------------------------------

/**
 * Extract the raw WEBVTT string from a single markdown block.
 *
 * Azure video analyzers embed WEBVTT content in one of three layouts:
 *   1. Block starts directly with "WEBVTT" (audio, and continuation chunks)
 *   2. WEBVTT is inside a code fence:
 *        ```webvtt
 *        WEBVTT
 *        ...
 *        ```
 *   3. WEBVTT header appears after chunk metadata lines:
 *        # Video: example.mp4
 *        Width: 1280
 *        Height: 720
 *        WEBVTT
 *        ...
 *
 * Only the FIRST block of a video result usually has the metadata prefix;
 * later chunks start directly with WEBVTT.  Checking /^WEBVTT/ alone skips
 * the first block, so the transcript would start from the middle of the video.
 * This function handles all three layouts so no chunk is silently skipped.
 *
 * Returns null when no WEBVTT content is found in the block.
 */
function extractWebVTTFromMarkdown(md: string): string | null {
  // Layout 1: block starts directly with WEBVTT
  if (/^WEBVTT/i.test(md) && md.includes("-->")) {
    return md;
  }

  // Layout 2: WEBVTT inside a fenced code block (```webvtt / ```vtt / ```)
  const fenceMatch = md.match(
    /```(?:webvtt|vtt|text|transcript)?\s*\r?\n(WEBVTT[\s\S]*?)```/i,
  );
  if (fenceMatch) {
    const vtt = fenceMatch[1].trim();
    if (vtt.includes("-->")) return vtt;
  }

  // Layout 3: WEBVTT header appears somewhere after metadata lines (no fence)
  const vttLineIdx = md.search(/(?:^|\n)WEBVTT(?:\r?\n|[ \t]*$)/im);
  if (vttLineIdx !== -1) {
    const headerStart = md.indexOf("WEBVTT", vttLineIdx);
    const extracted = md.slice(headerStart).trim();
    if (extracted.includes("-->")) return extracted;
  }

  return null;
}

/**
 * Strip video chunk metadata from a markdown block, leaving only the
 * human-readable transcript content (used in the plain-text fallback path).
 *
 * Removes:
 *   - "# Video: ..." / "# Audio: ..." / "# File: ..." headings
 *   - "Width: N" / "Height: N" / other key:value metadata lines
 *   - Standalone "Transcript" heading lines (with or without #)
 *   - Code fence delimiters (``` lines)
 */
function stripVideoMetadata(md: string): string {
  return md
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      if (/^#+\s*(video|audio|file|media|content)\s*:/i.test(t)) return false;
      if (
        /^(width|height|duration|framerate|frame_rate|fps|bitrate|format|codec|channels|samplerate|sample_rate|resolution)\s*:\s*/i.test(
          t,
        )
      )
        return false;
      if (/^#+\s*transcript\s*$/i.test(t) || /^transcript\s*$/i.test(t))
        return false;
      if (/^```/.test(t)) return false;
      return true;
    })
    .join("\n")
    .trim();
}

/**
 * For audio/video, Azure CU returns the call/media transcript in
 * contents[*].markdown.  This may be WEBVTT-formatted or plain text.
 *
 * Priority over other strategies:
 *  - If WEBVTT (at any position in the block) -> parse into timed segments
 *    so click-to-seek works
 *  - Otherwise -> strip chunk metadata and return as a single readable block
 *
 * Checks both rawResult.result.contents (SDK wrapper shape) and
 * rawResult.contents (direct shape) so it works regardless of serialisation.
 */
function extractContentsMarkdown(
  rawResult: Record<string, unknown>,
): TranscriptSegment[] {
  // Resolve the contents array -- handle both direct and result-wrapped shapes
  let contents: unknown[] | null = null;
  const nested = rawResult["result"];
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    const n = nested as Record<string, unknown>;
    if (Array.isArray(n["contents"])) contents = n["contents"] as unknown[];
  }
  if (!contents && Array.isArray(rawResult["contents"])) {
    contents = rawResult["contents"] as unknown[];
  }
  if (!contents || contents.length === 0) return [];

  // Collect non-empty markdown strings in document order
  const markdowns: string[] = [];
  for (const block of contents as Record<string, unknown>[]) {
    const md = block["markdown"];
    if (typeof md === "string" && md.trim()) {
      markdowns.push(md.trim());
    }
  }
  if (markdowns.length === 0) return [];

  // Extract WEBVTT from ALL markdown blocks and merge into one timeline.
  // Video results are chunked: the first block typically has "# Video: ..."
  // metadata before the WEBVTT header, while later blocks start directly with
  // WEBVTT.  extractWebVTTFromMarkdown handles all layout variants so no
  // chunk is silently skipped.  Cues are deduped across block boundaries.
  const allWebVTTSegs: TranscriptSegment[] = [];
  const seenVTTKeys = new Set<string>();
  let vttIdx = 0;

  for (const md of markdowns) {
    const webvttStr = extractWebVTTFromMarkdown(md);
    if (webvttStr) {
      for (const seg of parseWebVTT(webvttStr)) {
        const key = `${seg.startSec}|${seg.text.trim()}`;
        if (!seenVTTKeys.has(key)) {
          seenVTTKeys.add(key);
          allWebVTTSegs.push({ ...seg, id: `webvtt-${vttIdx++}` });
        }
      }
    }
  }

  if (allWebVTTSegs.length > 0) {
    // Sort ascending by start time in case blocks were out of order
    allWebVTTSegs.sort((a, b) => a.startSec - b.startSec);
    return allWebVTTSegs;
  }

  // No WEBVTT found -- join all blocks as a single readable plain-text block.
  // Strip chunk metadata (headings, Width/Height lines, code fences) so the
  // viewer does not see raw markdown syntax.
  // TranscriptPanel detects startSec===endSec===0 and renders as <pre>.
  const stripped = markdowns.map(stripVideoMetadata).filter(Boolean);
  const combined = stripped.length > 0 ? stripped.join("\n\n") : markdowns.join("\n\n");
  return [{ id: "md-0", startSec: 0, endSec: 0, text: combined }];
}
// ---------------------------------------------------------------------------
// Azure CU fields-array segment extraction (Structure B)
// ---------------------------------------------------------------------------

/**
 * Return true when a valueObject looks like a genuine transcript segment —
 * i.e. it has at least one field whose name indicates a timestamp.
 * This guards against treating non-transcript arrays (People, Companies,
 * Topics, Categories …) as transcript segments.
 */
function hasTimestampField(vo: Record<string, unknown>): boolean {
  return Object.keys(vo).some((k) => {
    const kl = k.toLowerCase();
    return (
      kl.includes("start") ||
      kl.includes("end") ||
      kl.includes("time") ||
      kl.includes("offset") ||
      kl.includes("duration")
    );
  });
}

/**
 * Walk contents[*].fields (and documents[*].fields) looking for any array
 * field whose items are Azure CU valueObject segments.
 *
 * Primary path supported:
 *   contents[*].fields["Segments"].valueArray[*].valueObject
 *     → { Text, StartTime, EndTime, SpeakerRole, … }
 *
 * No field name is hardcoded — every array field whose first item is a
 * valueObject is inspected.
 */
function extractAzureFieldSegments(
  rawResult: Record<string, unknown>,
): TranscriptSegment[] {
  const segments: TranscriptSegment[] = [];
  let idx = 0;

  function processFields(fields: Record<string, unknown>): void {
    for (const fieldVal of Object.values(fields)) {
      if (!fieldVal || typeof fieldVal !== "object") continue;
      const f = fieldVal as Record<string, unknown>;
      if (f["type"] !== "array") continue;

      const items = (
        Array.isArray(f["valueArray"])
          ? f["valueArray"]
          : Array.isArray(f["value_array"])
            ? f["value_array"]
            : null
      ) as unknown[] | null;
      if (!items || items.length === 0) continue;

      for (const item of items as Record<string, unknown>[]) {
        if (item["type"] !== "object") continue;
        const vo = (item["valueObject"] ?? item["value_object"]) as
          | Record<string, unknown>
          | undefined;
        if (!vo) continue;
        // Skip non-transcript objects (People, Companies, Topics …) that lack
        // any time-related key — they would produce fake 0:00 segments.
        if (!hasTimestampField(vo)) continue;

        const seg = normaliseValueObject(vo, idx);
        if (seg) {
          segments.push(seg);
          idx++;
        }
      }
    }
  }

  for (const containerKey of ["contents", "documents"]) {
    const container = rawResult[containerKey];
    if (!Array.isArray(container)) continue;
    for (const block of container as Record<string, unknown>[]) {
      const blockFields = block["fields"];
      if (
        blockFields &&
        typeof blockFields === "object" &&
        !Array.isArray(blockFields)
      ) {
        processFields(blockFields as Record<string, unknown>);
      }
    }
  }

  // Also try top-level fields
  const topFields = rawResult["fields"];
  if (topFields && typeof topFields === "object" && !Array.isArray(topFields)) {
    processFields(topFields as Record<string, unknown>);
  }

  return segments;
}

/**
 * Plain-text fallback — if no structured segments were found, look for any
 * sizeable non-WEBVTT string inside a fields value and return it as a single
 * segment.  The Transcript tab will render the raw text even when timestamps
 * are unavailable.
 *
 * endSec is set to 0 so the segment does not activate the "Now Playing" strip
 * (which would show a zero-duration active segment at 0:00), but the full
 * text is still readable in the Transcript tab.
 */
function extractPlainTextFallback(
  rawResult: Record<string, unknown>,
): TranscriptSegment[] {
  const candidates: string[] = [];

  function checkString(s: unknown): void {
    if (typeof s !== "string") return;
    const t = s.trim();
    // Require a multi-word string of meaningful length; exclude WEBVTT content
    if (t.length >= 20 && /\s/.test(t) && !/^WEBVTT/i.test(t)) {
      candidates.push(t);
    }
  }

  function scanFields(fields: Record<string, unknown>): void {
    for (const fieldVal of Object.values(fields)) {
      if (!fieldVal || typeof fieldVal !== "object") continue;
      const f = fieldVal as Record<string, unknown>;
      checkString(f["valueString"]);
      checkString(f["value_string"]);
      checkString(f["content"]);
    }
  }

  for (const containerKey of ["contents", "documents"]) {
    const container = rawResult[containerKey];
    if (!Array.isArray(container)) continue;
    for (const block of container as Record<string, unknown>[]) {
      checkString(block["content"]);
      checkString(block["transcript"]);
      const blockFields = block["fields"];
      if (
        blockFields &&
        typeof blockFields === "object" &&
        !Array.isArray(blockFields)
      ) {
        scanFields(blockFields as Record<string, unknown>);
      }
    }
  }

  const topFields = rawResult["fields"];
  if (topFields && typeof topFields === "object" && !Array.isArray(topFields)) {
    scanFields(topFields as Record<string, unknown>);
  }

  if (candidates.length === 0) return [];

  // Use the longest candidate string
  const bestText = candidates.reduce((a, b) => (b.length > a.length ? b : a));
  return [{ id: "plain-0", startSec: 0, endSec: 0, text: bestText }];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Extract transcript segments from a raw Azure CU result.
 * Returns an empty array when no transcript data is present.
 *
 * Priority:
 *   1. contents[*].markdown — primary source for audio/video (what Azure
 *      Content Understanding Studio shows).  Parsed as WEBVTT when the
 *      header is present; returned as plain-text otherwise.
 *   2. WEBVTT anywhere else in the raw result (fields, top-level strings)
 *   3. Flat JSON segment arrays: segments / utterances / phrases … (top-level
 *      or nested in contents[*] / transcription{})
 *   4. Azure CU fields-array segments: contents[*].fields[*].valueArray[*]
 *      .valueObject — ONLY accepted when the object has a timestamp field
 *      (Start, End, Time …) to prevent People/Topics arrays becoming segments
 *   5. Plain-text fallback: any sizeable string in a fields valueString
 */
export function extractTranscript(
  rawResult: Record<string, unknown>,
): TranscriptSegment[] {
  // 1. contents[*].markdown (WEBVTT or plain text)
  const mdSegs = extractContentsMarkdown(rawResult);
  if (mdSegs.length > 0) return deduplicateSegments(mdSegs);

  // 2. WEBVTT in any other location
  const webvttSegs = extractWebVTT(rawResult);
  if (webvttSegs.length > 0) return deduplicateSegments(webvttSegs);

  // 3. Flat JSON segment arrays
  const rawSegs = gatherRawSegments(rawResult);
  const jsonSegments: TranscriptSegment[] = [];
  for (let i = 0; i < rawSegs.length; i++) {
    const seg = normaliseSegment(rawSegs[i] as Record<string, unknown>, i);
    if (seg) jsonSegments.push(seg);
  }
  if (jsonSegments.length > 0) return deduplicateSegments(jsonSegments);

  // 4. Azure CU fields-array (valueObject) segments — timestamp-gated
  const fieldSegs = extractAzureFieldSegments(rawResult);
  if (fieldSegs.length > 0) return deduplicateSegments(fieldSegs);

  // 5. Plain-text fallback
  return extractPlainTextFallback(rawResult);
}
