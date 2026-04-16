/**
 * Extract markdown content from a raw Azure Content Understanding result.
 *
 * Azure CU returns an array of content blocks under `contents` (or `content`
 * depending on SDK version). Each block may carry a `markdown` string with
 * the structured text for that page / segment in reading order.
 *
 * This helper is fully dynamic — no document-type assumptions, no hardcoded
 * field names beyond the Azure CU schema keys.
 */
export function extractMarkdown(
  rawResult: Record<string, unknown>,
): string | null {
  // Azure CU schema key is "contents" (array). Some SDK versions may also
  // use "content" as a single object — handle both gracefully.
  const contentsRaw =
    rawResult["contents"] ??
    (Array.isArray(rawResult["content"])
      ? rawResult["content"]
      : rawResult["content"] !== undefined
        ? [rawResult["content"]]
        : undefined);

  if (!Array.isArray(contentsRaw) || contentsRaw.length === 0) return null;

  const blocks = (contentsRaw as Array<Record<string, unknown>>)
    .map((c) =>
      typeof c["markdown"] === "string" ? c["markdown"].trim() : null,
    )
    .filter((m): m is string => m !== null && m.length > 0);

  if (blocks.length === 0) return null;

  return blocks.join("\n\n");
}

/**
 * Build a Map of Azure CU figure IDs → data-URI strings from raw_result.
 *
 * Azure CU may include figures[] with base64-encoded image data when the
 * analyzer is configured to extract figures. The map key is the figure ID
 * exactly as it appears in markdown refs like `![](figures/1.1)` (i.e. the
 * part after "figures/").
 *
 * If no figure image data is present in the result (which is common), the
 * returned map is empty — callers should treat the figure as unresolvable
 * and hide the image rather than showing a broken placeholder.
 */
export function extractFigureMap(
  rawResult: Record<string, unknown>,
): Map<string, string> {
  const map = new Map<string, string>();

  function processFigures(figures: unknown[]) {
    for (const fig of figures) {
      const f = fig as Record<string, unknown>;
      // Azure CU figure id: e.g. "1.1", "fig.2"
      const id = f["id"] ?? f["figureId"] ?? f["figure_id"];
      if (typeof id !== "string") continue;

      // Look for inline image data — field names vary by SDK version
      for (const key of ["image", "imageData", "image_data", "content"]) {
        const raw = f[key];
        if (typeof raw !== "string" || raw.length === 0) continue;
        if (raw.startsWith("data:")) {
          map.set(id, raw);
        } else {
          // Treat as raw base64; default to PNG (most common for figures)
          map.set(id, `data:image/png;base64,${raw}`);
        }
        break;
      }
    }
  }

  // Top-level figures array
  if (Array.isArray(rawResult["figures"])) {
    processFigures(rawResult["figures"] as unknown[]);
  }

  // Per-block figures within contents / documents
  for (const key of ["contents", "documents"]) {
    const container = rawResult[key];
    if (Array.isArray(container)) {
      for (const block of container as Record<string, unknown>[]) {
        if (Array.isArray(block["figures"])) {
          processFigures(block["figures"] as unknown[]);
        }
      }
    }
  }

  return map;
}
