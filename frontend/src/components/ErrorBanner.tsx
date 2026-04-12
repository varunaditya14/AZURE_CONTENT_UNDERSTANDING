interface ErrorBannerProps {
  message: string;
  detail?: string;
  onDismiss?: () => void;
}

export default function ErrorBanner({
  message,
  detail,
  onDismiss,
}: ErrorBannerProps) {
  return (
    <div className="bg-[#dc2626]/5 border border-[#dc2626]/20 rounded-xl px-5 py-4 flex gap-3">
      <div className="flex-shrink-0 mt-0.5">
        <svg
          className="w-5 h-5 text-[#dc2626]"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[#dc2626]">{message}</p>
        {detail && (
          <p className="mt-1 text-xs text-[#dc2626]/80 break-words">{detail}</p>
        )}
      </div>
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 text-[#dc2626]/60 hover:text-[#dc2626] transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      )}
    </div>
  );
}
