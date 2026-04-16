/**
 * ImagePreviewPanel — renders the uploaded image with an SVG overlay.
 *
 * Overlay strategy:
 *   - Image: width:100%, height:auto  → fills container, no letterboxing
 *   - SVG:   position:absolute, inset:0, width:100%, height:100%
 *            viewBox="0 0 {pageWidth} {pageHeight}", preserveAspectRatio="none"
 *   Because the image maintains its natural aspect ratio and the SVG viewBox
 *   represents the same page proportions, polygons map pixel-perfectly without
 *   any manual offset / scale maths.
 *
 * Interaction:
 *   - Clicking a polygon → onOverlayClick(fieldName)  (or null to deselect)
 *   - Clicking SVG background → onOverlayClick(null)
 */

import { useEffect, useRef, useState } from "react";
import type { BoundingRegion, PageDimension } from "../utils/grounding";
import { polygonToPoints } from "../utils/grounding";

interface ImagePreviewPanelProps {
  imageFile: File;
  /** Map of fieldName → bounding regions (in inch space) */
  groundingMap: Map<string, BoundingRegion[]>;
  /** Page dimensions in inches; null = show image without overlay */
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

// Coral brand colour channels (matches #f05742)
const CORAL = "240,87,66";

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

/** Floating label shown near the highlighted bounding box (hover or selected). */
function FieldTooltip({
  regions,
  pageDimension,
  name,
  value,
  confidence,
}: {
  regions: BoundingRegion[];
  pageDimension: PageDimension;
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
  const pctLeft = ((minX + maxX) / 2 / pageDimension.width) * 100;
  const pctTopEdge = (minY / pageDimension.height) * 100;
  const pctBottomEdge = (maxY / pageDimension.height) * 100;
  // Flip below the box when near the top of the page to avoid overflowing
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

export default function ImagePreviewPanel({
  imageFile,
  groundingMap,
  pageDimension,
  selectedFieldName,
  hoveredFieldName,
  fieldDataMap,
  onOverlayClick,
}: ImagePreviewPanelProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);

  // Create and clean up the blob URL whenever imageFile changes
  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setBlobUrl(url);
    setImgLoaded(false);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  // Scroll the selected field's bounding region into view when selection changes.
  // Imperatively repositions an invisible anchor <div> inside the page container
  // to the region centre, then calls scrollIntoView so the nearest scroll
  // ancestor (the overflow-auto wrapper in DocumentPreviewPanel) scrolls just
  // enough to reveal it.
  useEffect(() => {
    if (!selectedFieldName || !pageDimension || !imgLoaded) return;
    const regions = groundingMap.get(selectedFieldName);
    if (!regions?.length) return;
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
    const el = anchorRef.current;
    if (!el) return;
    el.style.left = `${((minX + maxX) / 2 / pageDimension.width) * 100}%`;
    el.style.top = `${((minY + maxY) / 2 / pageDimension.height) * 100}%`;
    el.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [selectedFieldName, pageDimension, imgLoaded, groundingMap]);

  const hasOverlay =
    pageDimension !== null && imgLoaded && groundingMap.size > 0;

  // Tooltip shows for the hovered field; falls back to the selected field when idle
  const activeTooltipField = hasOverlay
    ? hoveredFieldName && groundingMap.has(hoveredFieldName)
      ? hoveredFieldName
      : selectedFieldName && groundingMap.has(selectedFieldName)
        ? selectedFieldName
        : null
    : null;

  return (
    <div className="relative bg-[#f9f9f8]">
      {/* Invisible anchor repositioned to the selected field's bbox centre;
          scrollIntoView() is called on it to pan the scroll container */}
      <div ref={anchorRef} className="absolute w-px h-px pointer-events-none" />
      {blobUrl ? (
        <>
          <img
            src={blobUrl}
            alt="Document preview"
            className="block w-full h-auto"
            onLoad={() => setImgLoaded(true)}
          />

          {hasOverlay && pageDimension && (
            <>
              <svg
                viewBox={`0 0 ${pageDimension.width} ${pageDimension.height}`}
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
                {/* Transparent background rect to capture deselect clicks */}
                <rect
                  x={0}
                  y={0}
                  width={pageDimension.width}
                  height={pageDimension.height}
                  fill="transparent"
                  style={{ pointerEvents: "all" }}
                />

                {/* Render unselected polygons first; selected last → paints on top */}
                {Array.from(groundingMap.entries())
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
                {selectedFieldName && groundingMap.has(selectedFieldName) && (
                  <FieldPolygon
                    key={`sel-${selectedFieldName}`}
                    fieldName={selectedFieldName}
                    regions={groundingMap.get(selectedFieldName)!}
                    isSelected={true}
                    isHovered={hoveredFieldName === selectedFieldName}
                    onSelect={onOverlayClick}
                  />
                )}
              </svg>

              {/* Tooltip: hover takes priority; falls back to selected field */}
              {activeTooltipField && (
                <FieldTooltip
                  regions={groundingMap.get(activeTooltipField)!}
                  pageDimension={pageDimension}
                  name={activeTooltipField}
                  value={fieldDataMap?.get(activeTooltipField)?.value ?? null}
                  confidence={
                    fieldDataMap?.get(activeTooltipField)?.confidence ?? null
                  }
                />
              )}
            </>
          )}
        </>
      ) : (
        <div className="w-full aspect-[3/4] flex items-center justify-center">
          <div className="w-6 h-6 rounded-full border-2 border-[#f05742] border-t-transparent animate-spin" />
        </div>
      )}
    </div>
  );
}
