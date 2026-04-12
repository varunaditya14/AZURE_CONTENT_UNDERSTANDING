import { getAnalyzerLabel } from "../utils/fileRouting";

interface AnalyzerBadgeProps {
  analyzerId: string;
  fileType: string;
  fileName: string;
}

export default function AnalyzerBadge({
  analyzerId,
  fileType,
  fileName,
}: AnalyzerBadgeProps) {
  const label = getAnalyzerLabel(fileType);

  return (
    <div className="bg-white border border-[#e5e4e2] rounded-xl shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="px-5 py-2.5 border-b border-[#e5e4e2] flex items-center gap-2 bg-[#f9f9f8]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#059669] flex-shrink-0" />
        <span className="text-xs font-medium text-[#6b6b68] uppercase tracking-wide">
          Analysis complete
        </span>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[#e5e4e2]">
        {/* File Name */}
        <div className="px-5 py-3.5">
          <p className="text-xs text-[#6b6b68] uppercase tracking-wide font-medium mb-1.5">
            File
          </p>
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-[#f05742] text-white tracking-wide flex-shrink-0">
              {fileType.toUpperCase()}
            </span>
            <span
              className="text-sm font-medium text-[#1a1a18] truncate"
              title={fileName}
            >
              {fileName}
            </span>
          </div>
        </div>

        {/* Analyzer name */}
        <div className="px-5 py-3.5">
          <p className="text-xs text-[#6b6b68] uppercase tracking-wide font-medium mb-1.5">
            Analyzer
          </p>
          <p className="text-sm font-medium text-[#1a1a18]">{label}</p>
        </div>

        {/* Analyzer ID */}
        <div className="px-5 py-3.5">
          <p className="text-xs text-[#6b6b68] uppercase tracking-wide font-medium mb-1.5">
            Analyzer ID
          </p>
          <code
            className="text-xs text-[#f05742] bg-[#f05742]/5 border border-[#f05742]/20 px-2 py-0.5 rounded font-mono break-all"
            title={analyzerId}
          >
            {analyzerId}
          </code>
        </div>
      </div>
    </div>
  );
}
