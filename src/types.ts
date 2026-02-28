/**
 * Core types for the Scribe provider architecture.
 */

export type OutputFormat = "text" | "markdown" | "json" | "srt";

export interface ExtractionOptions {
  language?: string;
  format?: OutputFormat;
  timestamps?: boolean;
}

export interface ExtractionMetadata {
  title?: string;
  author?: string;
  date?: string;
  source?: string;
  [key: string]: unknown;
}

export interface ExtractionResult {
  content: string;
  metadata: ExtractionMetadata;
  provider: string;
}

export interface ProviderCapabilities {
  formats: OutputFormat[];
  supportsLanguage: boolean;
  supportsTimestamps: boolean;
}

export interface ContentProvider {
  readonly name: string;
  readonly description: string;
  canHandle(input: string): boolean;
  extract(input: string, options?: ExtractionOptions): Promise<ExtractionResult>;
  capabilities(): ProviderCapabilities;
}
