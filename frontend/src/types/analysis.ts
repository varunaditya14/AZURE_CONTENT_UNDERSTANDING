export interface FieldResult {
  name: string;
  value: string | null;
  confidence: number | null;
  source?: string | null;
}

export interface AnalyzeResponse {
  success: boolean;
  file_name: string;
  file_type: string;
  analyzer_id: string;
  latency_ms: number;
  field_count: number;
  average_confidence: number | null;
  fields: FieldResult[];
  raw_result: Record<string, unknown>;
}

export interface ErrorResponse {
  success: false;
  error: string;
  detail?: string | null;
}
