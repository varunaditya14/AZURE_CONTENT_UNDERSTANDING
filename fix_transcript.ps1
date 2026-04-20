$path = "C:\iNextlabs\CONTENT_UNDERSTANDING\frontend\src\utils\transcript.ts"
$raw = [System.IO.File]::ReadAllText($path)
# Normalize to LF
$c = $raw -replace "`r`n", "`n"

# Find the section to replace
$startMarker = "// ---------------------------------------------------------------------------`n// Primary audio transcript source: contents[*].markdown`n// ---------------------------------------------------------------------------"
$endMarker = "`n// ---------------------------------------------------------------------------`n// Azure CU fields-array segment extraction (Structure B)"

$si = $c.IndexOf($startMarker)
$ei = $c.IndexOf($endMarker)

if ($si -eq -1) { Write-Error "Start marker not found"; exit 1 }
if ($ei -eq -1) { Write-Error "End marker not found"; exit 1 }

Write-Host "Found section at $si to $ei"

$newSection = @'
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
'@

$before = $c.Substring(0, $si)
$after = $c.Substring($ei)

$result = $before + $newSection + $after

# Write back with CRLF
$resultCRLF = $result -replace "(?<!\r)`n", "`r`n"
[System.IO.File]::WriteAllText($path, $resultCRLF, [System.Text.Encoding]::UTF8)
Write-Host "Done. File written."
