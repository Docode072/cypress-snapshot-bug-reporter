/**
 * Type definitions for AI provider integration
 */

import type { ImageRegion } from "./snapshot";

/**
 * Supported AI providers
 */
export type AIProvider = "openai" | "anthropic" | "google" | "custom";

/**
 * AI provider configuration
 */
export interface AIConfig {
  /**
   * AI provider name
   */
  provider: AIProvider;

  /**
   * Full API endpoint URL
   */
  endpoint: string;

  /**
   * Model name/identifier
   */
  model: string;

  /**
   * API key for authentication (current active key)
   */
  apiKey: string;

  /**
   * Array of all provided API keys
   */
  apiKeys: string[];

  /**
   * Index of the currently active API key
   */
  activeKeyIndex: number;

  /**
   * Request timeout in milliseconds
   * @default 60000
   */
  timeout: number;

  /**
   * Delay between region analysis calls in milliseconds (for rate limiting)
   * @default 2000 for Google, 0 for others
   */
  regionDelay?: number;

  /**
   * Maximum number of retries on rate limit (429) errors
   * @default 4
   */
  maxRetries?: number;
}

/**
 * Content types detected by AI
 */
export type ContentType =
  "Table" | "Text" | "Chart" | "Form" | "Card" | "Image" | "Unknown";

/**
 * Change types identified by AI
 */
export type ChangeType =
  | "value_changed"
  | "added"
  | "removed"
  | "color_changed"
  | "header_changed"
  | "no_change";

/**
 * Location hierarchy for structured change reporting
 */
export interface LocationHierarchy {
  /**
   * Type of UI element
   */
  type: "table" | "text" | "chart" | "form" | "card" | "image";

  /**
   * Section or card title (if visible)
   */
  section?: string;

  /**
   * Table name (if applicable)
   */
  tableName?: string;

  /**
   * Row information (for tables)
   */
  row?: {
    /**
     * 1-based row index
     */
    index: number;

    /**
     * Row header or primary label
     */
    label?: string;
  };

  /**
   * Column information (for tables)
   */
  column?: {
    /**
     * 1-based column index
     */
    index: number;

    /**
     * Column header text
     */
    header?: string;
  };

  /**
   * UI element description (for non-table types)
   */
  element?: string;

  /**
   * Rough position (e.g., "top-left", "center", "bottom-right")
   */
  position?: string;
}

/**
 * Individual change detail
 */
export interface ChangeDetail {
  /**
   * Full hierarchical path (e.g., "Section > Table > Row 1 > Col 2")
   */
  path: string;

  /**
   * Exact baseline value/text/color
   */
  baseline: string;

  /**
   * Exact actual value/text/color
   */
  actual: string;

  /**
   * Type of change
   */
  changeType: ChangeType;
}

/**
 * AI analysis result for a single diff region
 */
export interface AIAnalysisResult {
  /**
   * Original region coordinates
   */
  region: ImageRegion;

  /**
   * Detected content type
   */
  contentType: ContentType;

  /**
   * Structured location hierarchy
   */
  locationHierarchy: LocationHierarchy;

  /**
   * Exact baseline value (single changed field)
   */
  baselineValue: string;

  /**
   * Exact actual value (single changed field)
   */
  actualValue: string;

  /**
   * Primary change type
   */
  changeType: ChangeType;

  /**
   * Human-readable summary of the change
   */
  changeSummary: string;

  /**
   * AI confidence score (0.0 - 1.0)
   */
  confidence: number;

  /**
   * Detailed list of all changes in the region
   */
  allChanges: ChangeDetail[];

  /**
   * Error message (if analysis failed)
   */
  error?: string;
}

/**
 * Batch analysis result
 */
export interface BatchAnalysisResult {
  /**
   * Status of the analysis
   */
  status:
    | "success"
    | "no_diff_image"
    | "no_actual_image"
    | "no_baseline_image"
    | "no_red_regions"
    | "no_changes_detected"
    | "ai_config_error";

  /**
   * Snapshot name
   */
  name: string;

  /**
   * Number of regions processed
   */
  regionsProcessed: number;

  /**
   * Path to generated Excel report
   */
  excelPath?: string;

  /**
   * Individual region analysis results
   */
  results?: AIAnalysisResult[];

  /**
   * Error message (if analysis failed)
   */
  error?: string;
}

/**
 * Parameters for AI analysis
 */
export interface AnalysisParams {
  name: string;
  mismatch?: number;
  totalPixels?: number;
  severity?: "Low" | "Medium" | "High" | "Critical";
  BASELINE_DIR?: string;
  ACTUAL_DIR?: string;
  DIFF_DIR?: string;
  EXCEL_FILE?: string;
}
