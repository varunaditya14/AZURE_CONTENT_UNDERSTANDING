// ---------------------------------------------------------------------------
// Remote analyzer types — mirror the /analyzers backend API response shapes.
// ---------------------------------------------------------------------------

export interface RemoteAnalyzerField {
  name: string;
  description: string | null;
  type: string;
  method: string | null;
  /** Raw `items` object for array fields, e.g. {type:"string"} or {type:"object",...} */
  items?: Record<string, unknown> | null;
}

export interface RemoteAnalyzerListItem {
  id: string;
  name: string | null;
  description: string | null;
  status: string | null;
  field_count: number;
  created_at: string | null;
  last_modified_at: string | null;
}

export interface RemoteAnalyzerDetail extends RemoteAnalyzerListItem {
  fields: RemoteAnalyzerField[];
}
