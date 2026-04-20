import { useEffect, useRef } from "react";
import type { TranscriptSegment } from "../utils/transcript";
import { formatTime } from "../utils/transcript";

interface TranscriptPanelProps {
  segments: TranscriptSegment[];
  /** Current playback position in seconds */
  currentTime: number;
  /** Called when the user clicks a segment to seek */
  onSeek: (timeSec: number) => void;
}

// Speaker badge colour palette (coral first to match theme)
const SPEAKER_PALETTE = [
  "bg-[#f05742]/10 text-[#f05742] border-[#f05742]/25",
  "bg-blue-50 text-blue-600 border-blue-200",
  "bg-emerald-50 text-emerald-600 border-emerald-200",
  "bg-violet-50 text-violet-600 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-rose-50 text-rose-600 border-rose-200",
];

export default function TranscriptPanel({
  segments,
  currentTime,
  onSeek,
}: TranscriptPanelProps) {
  // Index of the segment whose time range contains currentTime
  const activeIdx = segments.findIndex(
    (s) => currentTime >= s.startSec && currentTime < s.endSec,
  );

  const activeRef = useRef<HTMLButtonElement | null>(null);

  // Auto-scroll active segment into view during playback
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [activeIdx]);

  if (segments.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <div className="w-10 h-10 rounded-full bg-[#f05742]/8 border border-[#f05742]/15 flex items-center justify-center">
          <svg
            className="w-5 h-5 text-[#f05742]/60"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 9.75a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375m-13.5 3.01c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.184-4.183a1.14 1.14 0 01.778-.332 48.294 48.294 0 005.83-.498c1.585-.233 2.708-1.626 2.708-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z"
            />
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold text-[#1a1a18]">
            No transcript available
          </p>
          <p className="text-xs text-[#6b6b68] mt-1 max-w-[240px] leading-relaxed">
            The analyzer did not return transcript segments for this file.
          </p>
        </div>
      </div>
    );
  }

  // Plain-text mode: a single segment with no real timestamps (startSec===endSec===0)
  // means the transcript came from a non-WEBVTT markdown block. Render it as
  // a readable scrollable block instead of a seekable button list.
  const isPlainText =
    segments.length === 1 &&
    segments[0].startSec === 0 &&
    segments[0].endSec === 0;

  if (isPlainText) {
    return (
      <div className="flex-1 overflow-y-auto px-4 py-4">
        <pre className="text-sm text-[#3d3d3a] whitespace-pre-wrap leading-relaxed font-sans">
          {segments[0].text}
        </pre>
      </div>
    );
  }

  // Build speaker → colour map (stable order, first-seen wins)
  const speakerColour: Record<string, string> = {};
  let colourIdx = 0;
  for (const seg of segments) {
    if (seg.speaker && !(seg.speaker in speakerColour)) {
      speakerColour[seg.speaker] =
        SPEAKER_PALETTE[colourIdx % SPEAKER_PALETTE.length];
      colourIdx++;
    }
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
      {segments.map((seg, idx) => {
        const isActive = idx === activeIdx;
        return (
          <button
            key={seg.id}
            ref={
              isActive
                ? (el) => {
                    activeRef.current = el;
                  }
                : undefined
            }
            onClick={() => onSeek(seg.startSec)}
            title={`Seek to ${formatTime(seg.startSec)}`}
            className={[
              "w-full text-left px-3 py-2.5 rounded-lg transition-colors duration-100 group",
              isActive
                ? "bg-[#f05742]/8 border border-[#f05742]/20"
                : "hover:bg-[#f9f9f8] border border-transparent hover:border-[#e5e4e2]",
            ].join(" ")}
          >
            <div className="flex items-start gap-2.5">
              {/* Timestamp badge */}
              <span
                className={[
                  "text-[11px] font-mono flex-shrink-0 mt-[3px] tabular-nums leading-none",
                  isActive ? "text-[#f05742] font-semibold" : "text-[#9b9b98]",
                ].join(" ")}
              >
                {formatTime(seg.startSec)}
              </span>

              <div className="flex-1 min-w-0">
                {/* Speaker label */}
                {seg.speaker && (
                  <span
                    className={[
                      "inline-block px-1.5 py-px rounded text-[10px] font-semibold border leading-tight mb-1 mr-1.5",
                      speakerColour[seg.speaker] ?? SPEAKER_PALETTE[0],
                    ].join(" ")}
                  >
                    {seg.speaker}
                  </span>
                )}
                {/* Segment text */}
                <span
                  className={[
                    "text-sm leading-snug",
                    isActive ? "text-[#1a1a18] font-medium" : "text-[#3d3d3a]",
                  ].join(" ")}
                >
                  {seg.text}
                </span>
              </div>

              {/* Play icon — visible on hover and when active */}
              <svg
                className={[
                  "w-3.5 h-3.5 flex-shrink-0 mt-[3px] transition-opacity",
                  isActive
                    ? "opacity-50 text-[#f05742]"
                    : "opacity-0 group-hover:opacity-35 text-[#6b6b68]",
                ].join(" ")}
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </button>
        );
      })}
    </div>
  );
}
