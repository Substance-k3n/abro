/**
 * The shape every apps/api error response takes, regardless of what threw it —
 * apps/web can parse one shape instead of guessing per-endpoint.
 */
export interface ApiErrorResponse {
  statusCode: number;
  /** Stable machine-readable code, e.g. "VALIDATION_ERROR", "NOT_FOUND". Never the raw exception class name. */
  code: string;
  message: string;
  /** Present for VALIDATION_ERROR: zod's flattened issue list. */
  details?: unknown;
  path: string;
  timestamp: string;
}
