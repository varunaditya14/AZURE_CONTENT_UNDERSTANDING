import { useEffect, useRef, useState } from "react";
import type { TranscriptSegment } from "../utils/transcript";
import { formatTime } from "../utils/transcript";

interface VideoPreviewPanelProps {
  videoFile: File;
  /** Segments passed for "now playing" subtitle overlay */
  segments: TranscriptSegment[];
  /** Current playback time reported by the parent for cross-panel coordination */
  currentTime: number;
  /** Callback to register the underlying HTMLMediaElement with the parent */
  onMediaRef: (el: HTMLMediaElement | null) => void;
  /** Callback fired on every timeupdate so the parent can track position */
  onTimeUpdate: (timeSec: number) => void;
}

export default function VideoPreviewPanel({
  videoFile,
  segments,
  currentTime,
  onMediaRef,
  onTimeUpdate,
}: VideoPreviewPanelProps) {
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const url = URL.createObjectURL(videoFile);
    setSrc(url);
    setIsLoading(true);
    setLoadError(null);
    setDuration(0);
    return () => URL.revokeObjectURL(url);
  }, [videoFile]);

  // Active segment for subtitle overlay
  const activeSeg =
    segments.find((s) => currentTime >= s.startSec && currentTime < s.endSec) ??
    null;

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Video — takes up the majority of the panel */}
      <div className="relative flex-1 min-h-0 bg-black">
        {src && !loadError ? (
          <video
            ref={(el) => {
              videoElRef.current = el;
              onMediaRef(el);
            }}
            src={src}
            controls
            className="w-full h-full object-contain"
            onPlay={() => {}}
            onPause={() => {}}
            onLoadedMetadata={() => {
              setIsLoading(false);
              setDuration(videoElRef.current?.duration ?? 0);
            }}
            onCanPlay={() => setIsLoading(false)}
            onTimeUpdate={() =>
              onTimeUpdate(videoElRef.current?.currentTime ?? 0)
            }
            onError={() => {
              setIsLoading(false);
              setLoadError("Could not load video file.");
            }}
          />
        ) : loadError ? (
          <div className="flex flex-col items-center justify-center gap-3 h-full text-white/60">
            <svg
              className="w-8 h-8"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={1.5}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
            <p className="text-sm">{loadError}</p>
          </div>
        ) : (
          isLoading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 rounded-full border-2 border-white/30 border-t-white/80 animate-spin" />
            </div>
          )
        )}

        {/* Subtitle overlay — active transcript segment */}
        {activeSeg && (
          <div className="absolute bottom-10 left-0 right-0 flex justify-center px-4 pointer-events-none">
            <div className="bg-black/75 backdrop-blur-sm rounded px-3 py-1.5 max-w-[90%] text-center">
              {activeSeg.speaker && (
                <span className="text-[10px] font-semibold text-[#f05742] mr-1.5">
                  {activeSeg.speaker}:
                </span>
              )}
              <span className="text-sm text-white leading-snug">
                {activeSeg.text}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Duration bar — compact info strip below video */}
      {duration > 0 && (
        <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 bg-[#1a1a18] border-t border-white/10">
          <span className="text-xs text-white/50 font-mono tabular-nums">
            {formatTime(currentTime)}
          </span>
          <span className="text-xs text-white/30 font-mono tabular-nums">
            {formatTime(duration)}
          </span>
        </div>
      )}
    </div>
  );
}
