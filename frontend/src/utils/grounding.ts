/**
 * Grounding utilities — extract bounding-region data from the raw Azure CU
 * result and build a flat map of fieldName → BoundingRegion[].
 *
 * The field names produced here mirror the recursion in the backend's
 * _flatten_fields() so that keys align perfectly with FieldResult.name.
 *
 * Azure polygon format: [x0,y0, x1,y1, x2,y2, x3,y3] — in inches,
 * relative to the top-left of the page.
 *
 * Page dimensions (width / height) are also in inches.
 */

type RawField = Record<string, unknown>;
type RawFieldMap = Record<string, RawField>;

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface BoundingRegion {
  page: number;
  /** 8 floats: [x0,y0, x1,y1, x2,y2, x3,y3] in inches */
  polygon: number[];
}

export interface PageDimension {
  /** Page width in inches */
  width: number;
  /** Page height in inches */
  height: number;
}

// ---------------------------------------------------------------------------
// Polygon helper
// ---------------------------------------------------------------------------

/** Converts a flat 8-float polygon array to an SVG points string. */
export function polygonToPoints(polygon: number[]): string {
  const pts: string[] = [];
  for (let i = 0; i + 1 < polygon.length; i += 2) {
    pts.push(`${polygon[i]},${polygon[i + 1]}`);
  }
  return pts.join(" ");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function safeRegions(field: RawField): BoundingRegion[] {
  const raw = field["boundingRegions"] ?? field["bounding_regions"];
  if (!Array.isArray(raw)) return [];
  return (raw as unknown[])
    .map((r) => {
      const region = r as Record<string, unknown>;
      return {
        page:
          typeof region["pageNumber"] === "number"
            ? region["pageNumber"]
            : typeof region["page_number"] === "number"
              ? region["page_number"]
              : 1,
        polygon: Array.isArray(region["polygon"])
          ? (region["polygon"] as number[])
          : [],
      };
    })
    .filter((r) => r.polygon.length >= 8);
}

/**
 * Mirror of backend _flatten_fields().
 * Walks the Azure field tree and populates `out` with fieldName → regions.
 */
function walkFields(
  fields: RawFieldMap,
  prefix: string,
  out: Map<string, BoundingRegion[]>,
): void {
  for (const [name, field] of Object.entries(fields)) {
    const fullName = prefix ? `${prefix}.${name}` : name;
    const fieldType = (field["type"] as string) ?? "string";

    if (fieldType === "array") {
      const items =
        ((field["valueArray"] ?? field["value_array"]) as RawField[]) ?? [];
      if (items.length === 0) {
        // Empty array — backend emits one row for the array itself
        const regions = safeRegions(field);
        if (regions.length) out.set(fullName, regions);
      } else {
        items.slice(0, 50).forEach((item, idx) => {
          const itemPrefix = `${fullName}[${idx}]`;
          if ((item["type"] as string) === "object") {
            const sub =
              ((item["valueObject"] ?? item["value_object"]) as RawFieldMap) ??
              {};
            walkFields(sub, itemPrefix, out);
          } else {
            const regions = safeRegions(item);
            if (regions.length) out.set(itemPrefix, regions);
          }
        });
      }
    } else if (fieldType === "object") {
      const sub =
        ((field["valueObject"] ?? field["value_object"]) as RawFieldMap) ?? {};
      walkFields(sub, fullName, out);
    } else {
      // address, currency, string, date, number, boolean, etc. — all leaves
      const regions = safeRegions(field);
      if (regions.length) out.set(fullName, regions);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Build a Map<fieldName, BoundingRegion[]> from raw_result.
 * Only entries with at least one valid region are included.
 */
export function buildGroundingMap(
  rawResult: Record<string, unknown>,
): Map<string, BoundingRegion[]> {
  const out = new Map<string, BoundingRegion[]>();

  let rawFields: RawFieldMap | null = null;
  for (const containerKey of ["contents", "documents"]) {
    const container = rawResult[containerKey];
    if (Array.isArray(container) && container.length > 0) {
      // Aggregate fields from ALL blocks — multi-page documents may distribute
      // fields across multiple content blocks.
      const merged: RawFieldMap = {};
      for (const block of container as Record<string, unknown>[]) {
        const blockFields = block["fields"] as RawFieldMap | undefined;
        if (blockFields && typeof blockFields === "object") {
          Object.assign(merged, blockFields);
        }
      }
      if (Object.keys(merged).length > 0) {
        rawFields = merged;
        break;
      }
    }
  }
  if (!rawFields) {
    rawFields = (rawResult["fields"] as RawFieldMap) ?? null;
  }

  if (rawFields && typeof rawFields === "object") {
    walkFields(rawFields, "", out);
  }

  return out;
}

/**
 * Extract the first page's dimensions (in inches) from raw_result.
 * Returns null if the data is absent or malformed.
 */
export function extractPageDimension(
  rawResult: Record<string, unknown>,
): PageDimension | null {
  for (const containerKey of ["contents", "documents"]) {
    const container = rawResult[containerKey];
    if (Array.isArray(container) && container.length > 0) {
      const pages = (container[0] as Record<string, unknown>)["pages"];
      if (Array.isArray(pages) && pages.length > 0) {
        const p = pages[0] as Record<string, unknown>;
        if (
          typeof p["width"] === "number" &&
          typeof p["height"] === "number" &&
          p["width"] > 0 &&
          p["height"] > 0
        ) {
          return { width: p["width"], height: p["height"] };
        }
      }
    }
  }
  return null;
}

/**
 * Extract ALL pages' dimensions (in inches) from raw_result.
 * Returns a Map<pageNumber (1-indexed), PageDimension>.
 * Reads from every content/document block to cover multi-page documents.
 */
export function extractAllPageDimensions(
  rawResult: Record<string, unknown>,
): Map<number, PageDimension> {
  const out = new Map<number, PageDimension>();

  function processPages(pages: unknown[]) {
    for (const p of pages) {
      const page = p as Record<string, unknown>;
      const rawNum = page["pageNumber"] ?? page["page_number"] ?? page["index"];
      const num = typeof rawNum === "number" ? rawNum : null;
      if (
        num !== null &&
        typeof page["width"] === "number" &&
        typeof page["height"] === "number" &&
        page["width"] > 0 &&
        page["height"] > 0 &&
        !out.has(num)
      ) {
        out.set(num, {
          width: page["width"] as number,
          height: page["height"] as number,
        });
      }
    }
  }

  for (const containerKey of ["contents", "documents"]) {
    const container = rawResult[containerKey];
    if (Array.isArray(container)) {
      for (const block of container as Record<string, unknown>[]) {
        if (Array.isArray(block["pages"])) {
          processPages(block["pages"] as unknown[]);
        }
      }
    }
  }
  // Top-level pages array as fallback
  if (Array.isArray(rawResult["pages"])) {
    processPages(rawResult["pages"] as unknown[]);
  }

  return out;
}
