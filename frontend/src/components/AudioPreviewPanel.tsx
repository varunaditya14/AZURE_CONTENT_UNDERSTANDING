import { useEffect, useRef, useState } from "react";
import type { TranscriptSegment } from "../utils/transcript";
import { formatTime } from "../utils/transcript";

interface AudioPreviewPanelProps {
  audioFile: File;
  /** Segments passed only for "now playing" subtitle; full transcript is in the right tab */
  segments: TranscriptSegment[];
  /** Current playback time reported by the parent for cross-panel coordination */
  currentTime: number;
  /** Callback to register the underlying HTMLMediaElement with the parent */
  onMediaRef: (el: HTMLMediaElement | null) => void;
  /** Callback fired on every timeupdate so the parent can track position */
  onTimeUpdate: (timeSec: number) => void;
}

export default function AudioPreviewPanel({
  audioFile,
  segments,
  currentTime,
  onMediaRef,
  onTimeUpdate,
}: AudioPreviewPanelProps) {
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Revoke previous object URL and create a new one when file changes
  useEffect(() => {
    const url = URL.createObjectURL(audioFile);
    setSrc(url);
    setIsPlaying(false);
    setDuration(0);
    setLoadError(null);
    return () => URL.revokeObjectURL(url);
  }, [audioFile]);

  function togglePlay() {
    const el = audioElRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().catch(() => {});
    } else {
      el.pause();
    }
  }

  function handleProgressClick(e: React.MouseEvent<HTMLDivElement>) {
    const el = audioElRef.current;
    if (!el || duration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
  }

  const progress = duration > 0 ? currentTime / duration : 0;

  // Active segment for "now playing" subtitle
  const activeSeg =
    segments.find((s) => currentTime >= s.startSec && currentTime < s.endSec) ??
    null;

  return (
    <div className="flex flex-col bg-white">
      {/* Hidden audio element */}
      {src && (
        <audio
          ref={(el) => {
            audioElRef.current = el;
            onMediaRef(el);
          }}
          src={src}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
          onTimeUpdate={() =>
            onTimeUpdate(audioElRef.current?.currentTime ?? 0)
          }
          onLoadedMetadata={() =>
            setDuration(audioElRef.current?.duration ?? 0)
          }
          onError={() => setLoadError("Could not load audio file.")}
          className="hidden"
          preload="metadata"
        />
      )}

      {/* Player card */}
      <div className="flex flex-col items-center gap-4 px-6 py-5">
        {/* Waveform / audio icon */}
        <div className="w-12 h-12 rounded-full bg-[#f05742]/10 border border-[#f05742]/20 flex items-center justify-center flex-shrink-0">
          <svg
            className="w-6 h-6 text-[#f05742]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0 0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25 2.25 0 009 15.553z"
            />
          </svg>
        </div>

        <div className="w-full space-y-3">
          {/* File name */}
          <p
            className="text-sm font-semibold text-[#1a1a18] text-center truncate"
            title={audioFile.name}
          >
            {audioFile.name}
          </p>

          {/* Animated bars — only shown while playing */}
          <div className="flex items-end justify-center gap-0.5 h-6">
            {Array.from({ length: 20 }).map((_, i) => (
              <div
                key={i}
                className={[
                  "w-1 rounded-full flex-shrink-0 transition-all",
                  isPlaying ? "bg-[#f05742]" : "bg-[#e5e4e2]",
                ].join(" ")}
                style={{
                  height: isPlaying
                    ? `${Math.max(20, Math.sin(i * 0.8) * 50 + 60)}%`
                    : "25%",
                  animationDelay: `${i * 50}ms`,
                  transition: isPlaying
                    ? `height ${300 + i * 30}ms ease-in-out ${i * 40}ms`
                    : "height 300ms ease",
                }}
              />
            ))}
          </div>

          {loadError ? (
            <p className="text-xs text-[#dc2626] text-center">{loadError}</p>
          ) : (
            <>
              {/* Progress bar */}
              <div
                className="relative h-1.5 bg-[#e5e4e2] rounded-full cursor-pointer group"
                onClick={handleProgressClick}
                role="slider"
                aria-label="Seek"
                aria-valuenow={Math.round(currentTime)}
                aria-valuemax={Math.round(duration)}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-[#f05742] rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-[#f05742] border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ left: `calc(${progress * 100}% - 6px)` }}
                />
              </div>

              {/* Time display */}
              <div className="flex items-center justify-between text-xs text-[#9b9b98] font-mono tabular-nums">
                <span>{formatTime(currentTime)}</span>
                <span>{duration > 0 ? formatTime(duration) : "—"}</span>
              </div>

              {/* Play / Pause button */}
              <div className="flex justify-center">
                <button
                  onClick={togglePlay}
                  disabled={!src || !!loadError}
                  aria-label={isPlaying ? "Pause" : "Play"}
                  className="w-11 h-11 rounded-full bg-[#f05742] text-white flex items-center justify-center hover:bg-[#d94534] disabled:opacity-40 transition-colors shadow-md"
                >
                  {isPlaying ? (
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M6 5a1 1 0 011-1h1a1 1 0 011 1v14a1 1 0 01-1 1H7a1 1 0 01-1-1V5zm9 0a1 1 0 011-1h1a1 1 0 011 1v14a1 1 0 01-1 1h-1a1 1 0 01-1-1V5z" />
                    </svg>
                  ) : (
                    <svg
                      className="w-4 h-4 ml-0.5"
                      fill="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* "Now playing" strip — only rendered while a segment is active */}
      {activeSeg && (
        <div className="flex-shrink-0 px-5 py-3.5 border-t border-[#e5e4e2] bg-[#f9f9f8]">
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#f05742] flex-shrink-0 animate-pulse" />
            <p className="text-[10px] font-semibold text-[#f05742] uppercase tracking-wider">
              Now Playing
            </p>
          </div>
          {activeSeg.speaker && (
            <span className="inline-block px-1.5 py-px rounded text-[10px] font-semibold border bg-[#f05742]/10 text-[#f05742] border-[#f05742]/25 leading-tight mb-1">
              {activeSeg.speaker}
            </span>
          )}
          <p className="text-sm text-[#1a1a18] leading-snug font-medium">
            {activeSeg.text}
          </p>
          <p className="text-xs text-[#9b9b98] font-mono mt-1">
            {formatTime(activeSeg.startSec)} – {formatTime(activeSeg.endSec)}
          </p>
        </div>
      )}
    </div>
  );
}
