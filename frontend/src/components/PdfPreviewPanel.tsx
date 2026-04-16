/**
 * PdfPreviewPanel — multi-page PDF renderer with per-page SVG grounding overlays.
 *
 * Two-phase load strategy:
 *   Phase 1 (useEffect on pdfFile): loads the PDF document and collects ALL
 *     page dimensions (viewport.width / 72 = inches) → setPageInfos.
 *     React commits, mounting a canvas element per page.
 *   Phase 2 (useLayoutEffect on pageInfos.length): paints each canvas now
 *     that callback refs are guaranteed populated by the layout commit.
 *
 * Overlay strategy (per page):
 *   SVG viewBox="0 0 {widthIn} {heightIn}" preserveAspectRatio="none"
 *   Azure CU polygons are in inch-space; pdfjs viewport.width / 72 = inches.
 *   Polygons map 1:1 to SVG user-units without any manual transform maths.
 *
 * Bounding regions are page-aware: each BoundingRegion carries a `page`
 * number so polygons are only shown on the page they belong to.
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import { polygonToPoints } from "../utils/grounding";

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const CORAL = "240,87,66";
const PAD = 16; // px padding around the stacked page area
const GAP = 12; // px gap between pages

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PageInfo {
  pageNum: number; // 1-indexed
  widthIn: number; // page width in inches (from pdfjs viewport.width / 72)
  heightIn: number; // page height in inches
  widthPx: number; // canvas pixel width at scale=2
  heightPx: number; // canvas pixel height at scale=2
  rendered: boolean;
}

interface PdfPreviewPanelProps {
  pdfFile: File;
  /** Map of fieldName → bounding regions (in inch space, with page numbers) */
  groundingMap: Map<string, BoundingRegion[]>;
  /**
   * Kept for API compatibility with DocumentPreviewPanel.
   * The PDF panel derives per-page dimensions from pdfjs internally.
   */
  pageDimension: PageDimension | null;
  selectedFieldName: string | null;
  /** Field name being hovered in the right-panel table */
  hoveredFieldName?: string | null;
  /** Value + confidence for each field, used in the hover tooltip */
  fieldDataMap?: Map<
    string,
    { value: string | null; confidence: number | null }
  >;
  onOverlayClick: (name: string | null) => void;
}

// ---------------------------------------------------------------------------
// FieldPolygon — renders all regions for one field on one page
// ---------------------------------------------------------------------------

function FieldPolygon({
  fieldName,
  regions,
  isSelected,
  isHovered,
  onSelect,
}: {
  fieldName: string;
  regions: BoundingRegion[];
  isSelected: boolean;
  isHovered: boolean;
  onSelect: (name: string | null) => void;
}) {
  const [mouseOver, setMouseOver] = useState(false);
  const active = isHovered || mouseOver;

  // Selected: strong coral fill + full-opacity stroke + glow drop-shadow
  // Hover:    clear but subdued tint/stroke
  // Resting:  faint tint only
  const fill = isSelected
    ? `rgba(${CORAL},${mouseOver ? "0.35" : "0.28"})`
    : active
      ? `rgba(${CORAL},0.14)`
      : `rgba(${CORAL},0.07)`;

  const stroke = isSelected
    ? `rgba(${CORAL},1)`
    : active
      ? `rgba(${CORAL},0.75)`
      : `rgba(${CORAL},0.38)`;

  const strokeWidth = isSelected ? 0.045 : active ? 0.022 : 0.012;

  const shadowOpacity =
    mouseOver && isSelected ? "0.70" : isSelected ? "0.55" : "0.35";
  const shadowRadius = isSelected ? (mouseOver ? "4px" : "3px") : "2px";
  const filter =
    isSelected || active
      ? `drop-shadow(0 0 ${shadowRadius} rgba(${CORAL},${shadowOpacity}))`
      : undefined;

  return (
    <>
      {regions.map((region, ri) => (
        <polygon
          key={`${fieldName}-${ri}`}
          points={polygonToPoints(region.polygon)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
          style={{ pointerEvents: "all", cursor: "pointer", filter }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(isSelected ? null : fieldName);
          }}
          onMouseEnter={() => setMouseOver(true)}
          onMouseLeave={() => setMouseOver(false)}
        />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// FieldTooltip — uses PageInfo (inch dims) for percentage positioning
// ---------------------------------------------------------------------------

function FieldTooltip({
  regions,
  pageInfo,
  name,
  value,
  confidence,
}: {
  regions: BoundingRegion[];
  pageInfo: PageInfo;
  name: string;
  value: string | null;
  confidence: number | null;
}) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const r of regions) {
    for (let i = 0; i + 1 < r.polygon.length; i += 2) {
      minX = Math.min(minX, r.polygon[i]);
      maxX = Math.max(maxX, r.polygon[i]);
      minY = Math.min(minY, r.polygon[i + 1]);
      maxY = Math.max(maxY, r.polygon[i + 1]);
    }
  }
  const pctLeft = ((minX + maxX) / 2 / pageInfo.widthIn) * 100;
  const pctTopEdge = (minY / pageInfo.heightIn) * 100;
  const pctBottomEdge = (maxY / pageInfo.heightIn) * 100;
  const placeAbove = pctTopEdge > 12;
  const pct = confidence !== null ? Math.round(confidence * 100) : null;
  let badgeClass = "bg-[#059669]/10 text-[#059669] border-[#059669]/20";
  if (pct !== null && pct < 50)
    badgeClass = "bg-[#dc2626]/10 text-[#dc2626] border-[#dc2626]/20";
  else if (pct !== null && pct < 80)
    badgeClass = "bg-[#d97706]/10 text-[#d97706] border-[#d97706]/20";

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        left: `${pctLeft}%`,
        top: placeAbove ? `${pctTopEdge}%` : `${pctBottomEdge}%`,
        transform: placeAbove
          ? "translate(-50%, calc(-100% - 8px))"
          : "translate(-50%, 8px)",
        maxWidth: "200px",
        minWidth: "120px",
      }}
    >
      {/* Directional caret pointing toward the box */}
      <div
        style={{
          position: "absolute",
          ...(placeAbove
            ? { bottom: -5, borderTop: "5px solid #e5e4e2" }
            : { top: -5, borderBottom: "5px solid #e5e4e2" }),
          left: "50%",
          transform: "translateX(-50%)",
          width: 0,
          height: 0,
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
        }}
      />
      <div className="bg-white/95 backdrop-blur-sm border border-[#e5e4e2] rounded-lg shadow-lg px-2.5 py-2">
        <p className="text-xs font-mono font-semibold text-[#f05742] truncate mb-0.5">
          {name}
        </p>
        <p className="text-xs text-[#1a1a18] leading-snug break-words line-clamp-2">
          {value ?? (
            <em className="not-italic text-[#6b6b68] text-[10px]">null</em>
          )}
        </p>
        {pct !== null && (
          <span
            className={`inline-flex items-center mt-1 px-1.5 py-px rounded text-[10px] font-semibold border ${badgeClass}`}
          >
            {pct}%
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PdfPreviewPanel({
  pdfFile,
  groundingMap,
  selectedFieldName,
  hoveredFieldName,
  fieldDataMap,
  onOverlayClick,
}: PdfPreviewPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  /** Live pdfjs document — shared between Phase 1 and Phase 2 via ref. */
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  /** Canvas elements registered by callback refs, keyed by 1-indexed page number. */
  const canvasesRef = useRef<Map<number, HTMLCanvasElement>>(new Map());

  const [pageInfos, setPageInfos] = useState<PageInfo[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 });

  const STEP = 0.25;
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 3;

  // Callback ref factory — assigns / removes canvas for each page.
  function canvasCallbackRef(pageNum: number) {
    return (el: HTMLCanvasElement | null) => {
      if (el) canvasesRef.current.set(pageNum, el);
      else canvasesRef.current.delete(pageNum);
    };
  }

  // ── ResizeObserver: track scroll-container dimensions ──────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Reset zoom & scroll on new PDF ─────────────────────────────────────────
  useEffect(() => {
    setZoom(1);
    containerRef.current?.scrollTo(0, 0);
  }, [pdfFile]);

  // ── Phase 1: load document, collect ALL page dimensions ────────────────────
  useEffect(() => {
    let cancelled = false;
    setPageInfos([]);
    setLoadError(null);

    if (docRef.current) {
      docRef.current.destroy();
      docRef.current = null;
    }

    const url = URL.createObjectURL(pdfFile);

    (async () => {
      let doc: pdfjsLib.PDFDocumentProxy;
      try {
        doc = await pdfjsLib.getDocument(url).promise;
      } catch (err) {
        if (!cancelled)
          setLoadError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (cancelled) {
        doc.destroy();
        return;
      }

      docRef.current = doc;
      const infos: PageInfo[] = [];

      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        // scale=1: 1 pt = 1/72 inch → viewport.width / 72 = width in inches
        const vp1 = page.getViewport({ scale: 1 });
        const vp2 = page.getViewport({ scale: 2 });
        infos.push({
          pageNum: p,
          widthIn: vp1.width / 72,
          heightIn: vp1.height / 72,
          widthPx: Math.floor(vp2.width),
          heightPx: Math.floor(vp2.height),
          rendered: false,
        });
        page.cleanup();
        if (cancelled) return;
      }

      if (!cancelled) setPageInfos(infos);
    })().finally(() => URL.revokeObjectURL(url));

    return () => {
      cancelled = true;
    };
  }, [pdfFile]);

  // ── Unmount cleanup ─────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      docRef.current?.destroy();
      docRef.current = null;
    };
  }, []);

  // ── Phase 2: render canvases (fires after React commits canvas nodes to DOM)─
  // useLayoutEffect guarantees canvas callback refs have fired before we paint.
  useLayoutEffect(() => {
    if (pageInfos.length === 0 || !docRef.current) return;
    const doc = docRef.current;
    let cancelled = false;

    (async () => {
      for (const info of pageInfos) {
        if (cancelled) break;
        const canvas = canvasesRef.current.get(info.pageNum);
        if (!canvas) {
          console.warn(
            `[PdfPreviewPanel] canvas not found for page ${info.pageNum}`,
          );
          continue;
        }
        try {
          const page = await doc.getPage(info.pageNum);
          if (cancelled) break;
          const viewport = page.getViewport({ scale: 2 });
          canvas.width = info.widthPx;
          canvas.height = info.heightPx;
          await page.render({ canvas, viewport }).promise;
          page.cleanup();
          if (cancelled) break;
          setPageInfos((prev) =>
            prev.map((pi) =>
              pi.pageNum === info.pageNum ? { ...pi, rendered: true } : pi,
            ),
          );
        } catch (err) {
          if (!cancelled)
            console.error(
              `[PdfPreviewPanel] render error page ${info.pageNum}:`,
              err,
            );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageInfos.length]); // fires exactly once per pdf load (0 → N)

  // ── Scroll to selected field's bounding region ─────────────────────────────
  useEffect(() => {
    if (!selectedFieldName || pageInfos.length === 0 || containerSize.w === 0)
      return;
    const regions = groundingMap.get(selectedFieldName);
    if (!regions?.length) return;

    // Use the first region's page to determine scroll target
    const firstRegion = regions[0];
    const pageIdx = pageInfos.findIndex((p) => p.pageNum === firstRegion.page);
    if (pageIdx < 0) return;

    const info = pageInfos[pageIdx];
    const pageRegions = regions.filter((r) => r.page === info.pageNum);

    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const r of pageRegions) {
      for (let i = 0; i + 1 < r.polygon.length; i += 2) {
        minX = Math.min(minX, r.polygon[i]);
        maxX = Math.max(maxX, r.polygon[i]);
        minY = Math.min(minY, r.polygon[i + 1]);
        maxY = Math.max(maxY, r.polygon[i + 1]);
      }
    }
    if (!isFinite(minY)) return;

    const aw = Math.max(0, containerSize.w - PAD * 2);
    const pw = aw * zoom;

    // Accumulate page tops within the scroll container content area
    let pageTop = PAD;
    for (let j = 0; j < pageIdx; j++) {
      const pi = pageInfos[j];
      pageTop += pw * (pi.heightIn / pi.widthIn) + GAP;
      if (pageInfos.length > 1) pageTop += 24; // page-label row height
    }
    if (pageInfos.length > 1) pageTop += 24; // label row above current page

    const ph = pw * (info.heightIn / info.widthIn);
    const regionCenterY = pageTop + ((minY + maxY) / 2 / info.heightIn) * ph;

    containerRef.current?.scrollTo({
      top: Math.max(0, regionCenterY - containerSize.h / 2),
      behavior: "smooth",
    });
  }, [selectedFieldName, groundingMap, pageInfos, zoom, containerSize]);

  // ── Per-page grounding map (pre-computed for render efficiency) ────────────
  // Map<pageNum, Map<fieldName, BoundingRegion[]>> regions already filtered to that page.
  const perPageGrounding = useMemo(() => {
    const result = new Map<number, Map<string, BoundingRegion[]>>();
    for (const [name, regions] of groundingMap) {
      for (const r of regions) {
        if (!result.has(r.page)) result.set(r.page, new Map());
        const pm = result.get(r.page)!;
        if (!pm.has(name)) pm.set(name, []);
        pm.get(name)!.push(r);
      }
    }
    return result;
  }, [groundingMap]);

  // ── Tooltip field: hover takes priority, falls back to selected ────────────
  const activeTooltipField =
    hoveredFieldName && groundingMap.has(hoveredFieldName)
      ? hoveredFieldName
      : selectedFieldName && groundingMap.has(selectedFieldName)
        ? selectedFieldName
        : null;

  const activeTooltipPage = activeTooltipField
    ? (groundingMap.get(activeTooltipField)?.[0]?.page ?? null)
    : null;

  // ── Layout calculations ────────────────────────────────────────────────────
  const availW = Math.max(0, containerSize.w - PAD * 2);
  const pageW = availW * zoom; // all pages share the same displayed width

  const ready = pageInfos.length > 0 && containerSize.w > 0;

  function handleReset() {
    setZoom(1);
    containerRef.current?.scrollTo({ top: 0, left: 0, behavior: "smooth" });
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-full w-full">
      {/* ── Scrollable page stack ── */}
      <div
        ref={containerRef}
        className="h-full w-full overflow-auto bg-[#f9f9f8]"
      >
        {/* Loading — container not yet measured or pages not yet loaded */}
        {!ready && !loadError && (
          <div className="flex items-center justify-center h-full w-full">
            <div className="w-6 h-6 rounded-full border-2 border-[#f05742] border-t-transparent animate-spin" />
          </div>
        )}

        {/* Error */}
        {loadError && (
          <div className="flex flex-col items-center justify-center h-full w-full gap-3 px-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#dc2626]/10 border border-[#dc2626]/20 flex items-center justify-center flex-shrink-0">
              <svg
                className="w-5 h-5 text-[#dc2626]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.8}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-[#1a1a18]">
                PDF preview failed
              </p>
              <p className="text-xs text-[#6b6b68] mt-1 max-w-[260px] leading-relaxed">
                {loadError}
              </p>
            </div>
          </div>
        )}

        {/* Stacked pages */}
        {ready && (
          <div
            style={{
              padding: PAD,
              display: "flex",
              flexDirection: "column",
              gap: GAP,
              minWidth: pageW + PAD * 2,
            }}
          >
            {pageInfos.map((info) => {
              const ph =
                pageW > 0 ? pageW * (info.heightIn / info.widthIn) : 0;
              const pageMap = perPageGrounding.get(info.pageNum);
              const hasOverlay = info.rendered && (pageMap?.size ?? 0) > 0;

              return (
                <div
                  key={info.pageNum}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  {/* Page label — only shown for multi-page documents */}
                  {pageInfos.length > 1 && (
                    <div className="text-xs text-[#9b9b97] text-center select-none">
                      Page {info.pageNum} / {pageInfos.length}
                    </div>
                  )}

                  {/* Page box */}
                  <div
                    className="relative flex-shrink-0 bg-white shadow-sm"
                    style={{ width: pageW, height: ph }}
                  >
                    {/*
                     * Canvas is ALWAYS mounted so canvasCallbackRef has a node
                     * to register before Phase 2 fires (useLayoutEffect fires
                     * after React commits the canvas nodes to the DOM).
                     */}
                    <canvas
                      ref={canvasCallbackRef(info.pageNum)}
                      className="absolute inset-0 w-full h-full block"
                    />

                    {/* Per-page spinner while pdfjs is painting pixels */}
                    {!info.rendered && !loadError && (
                      <div className="absolute inset-0 flex items-center justify-center bg-[#f9f9f8]/80">
                        <div className="w-5 h-5 rounded-full border-2 border-[#f05742] border-t-transparent animate-spin" />
                      </div>
                    )}

                    {/* SVG overlay — only when this page has grounding data */}
                    {hasOverlay && pageMap && (
                      <>
                        <svg
                          viewBox={`0 0 ${info.widthIn} ${info.heightIn}`}
                          preserveAspectRatio="none"
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            overflow: "visible",
                          }}
                          onClick={() => onOverlayClick(null)}
                        >
                          {/* Transparent hit-area to deselect on page click */}
                          <rect
                            x={0}
                            y={0}
                            width={info.widthIn}
                            height={info.heightIn}
                            fill="transparent"
                            style={{ pointerEvents: "all" }}
                          />
                          {/* Unselected polygons first — renders below selected */}
                          {Array.from(pageMap.entries())
                            .filter(([fn]) => fn !== selectedFieldName)
                            .map(([fieldName, regions]) => (
                              <FieldPolygon
                                key={fieldName}
                                fieldName={fieldName}
                                regions={regions}
                                isSelected={false}
                                isHovered={hoveredFieldName === fieldName}
                                onSelect={onOverlayClick}
                              />
                            ))}
                          {/* Selected polygon last — always on top */}
                          {selectedFieldName &&
                            pageMap.has(selectedFieldName) && (
                              <FieldPolygon
                                key={`sel-${selectedFieldName}`}
                                fieldName={selectedFieldName}
                                regions={pageMap.get(selectedFieldName)!}
                                isSelected={true}
                                isHovered={
                                  hoveredFieldName === selectedFieldName
                                }
                                onSelect={onOverlayClick}
                              />
                            )}
                        </svg>

                        {/* Tooltip — shown on the page that owns the active field */}
                        {activeTooltipField &&
                          activeTooltipPage === info.pageNum &&
                          pageMap.has(activeTooltipField) && (
                            <FieldTooltip
                              regions={pageMap.get(activeTooltipField)!}
                              pageInfo={info}
                              name={activeTooltipField}
                              value={
                                fieldDataMap?.get(activeTooltipField)?.value ??
                                null
                              }
                              confidence={
                                fieldDataMap?.get(activeTooltipField)
                                  ?.confidence ?? null
                              }
                            />
                          )}
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Zoom controls (float, never scrolls away) ── */}
      {ready && (
        <div className="absolute bottom-3 right-3 z-10 flex items-center gap-0.5 bg-white/90 backdrop-blur-sm border border-[#e5e4e2] rounded-lg shadow-sm px-1.5 py-1.5">
          {/* Zoom out */}
          <button
            onClick={() =>
              setZoom((z) => Math.max(MIN_ZOOM, +(z - STEP).toFixed(2)))
            }
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            aria-label="Zoom out"
            className="w-6 h-6 flex items-center justify-center rounded text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-semibold leading-none"
          >
            −
          </button>

          {/* Current zoom level */}
          <span className="text-xs text-[#6b6b68] w-10 text-center tabular-nums select-none">
            {Math.round(zoom * 100)}%
          </span>

          {/* Zoom in */}
          <button
            onClick={() =>
              setZoom((z) => Math.min(MAX_ZOOM, +(z + STEP).toFixed(2)))
            }
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            aria-label="Zoom in"
            className="w-6 h-6 flex items-center justify-center rounded text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors text-base font-semibold leading-none"
          >
            +
          </button>

          {/* Divider */}
          <div className="w-px h-4 bg-[#e5e4e2] mx-1 flex-shrink-0" />

          {/* Reset to fit */}
          <button
            onClick={handleReset}
            disabled={zoom === 1}
            title="Reset zoom"
            aria-label="Reset zoom"
            className="w-6 h-6 flex items-center justify-center rounded text-[#6b6b68] hover:text-[#f05742] hover:bg-[#f05742]/8 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M15 15h4.5M15 15v4.5M9 15H4.5M9 15v4.5"
              />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}

