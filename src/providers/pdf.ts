import { extractText } from "unpdf";
import type {
  ContentProvider,
  ExtractionOptions,
  ExtractionResult,
  ProviderCapabilities,
} from "../types.ts";
import { ExtractionError } from "../lib/errors.ts";

export class PdfProvider implements ContentProvider {
  readonly name = "pdf";
  readonly description = "Extracts text content from PDF files (URLs or local paths)";

  canHandle(input: string): boolean {
    // Local file path ending in .pdf
    if (input.startsWith("/") && input.toLowerCase().endsWith(".pdf")) {
      return true;
    }

    // HTTP(S) URL ending in .pdf
    try {
      const url = new URL(input);
      if (
        (url.protocol === "http:" || url.protocol === "https:") &&
        url.pathname.toLowerCase().endsWith(".pdf")
      ) {
        return true;
      }
    } catch {
      // Not a URL
    }

    return false;
  }

  capabilities(): ProviderCapabilities {
    return {
      formats: ["text"],
      supportsLanguage: false,
      supportsTimestamps: false,
    };
  }

  async extract(input: string, _options: ExtractionOptions = {}): Promise<ExtractionResult> {
    try {
      let buffer: ArrayBuffer;

      if (input.startsWith("/")) {
        // Local file
        const file = Bun.file(input);
        if (!(await file.exists())) {
          throw new ExtractionError(`PDF file not found: ${input}`);
        }
        buffer = await file.arrayBuffer();
      } else {
        // Remote URL
        const resp = await fetch(input);
        if (!resp.ok) {
          throw new ExtractionError(`HTTP ${resp.status} fetching PDF: ${input}`);
        }
        buffer = await resp.arrayBuffer();
      }

      const { text, totalPages } = await extractText(new Uint8Array(buffer), {
        mergePages: true,
      });

      const content = (Array.isArray(text) ? text.join("\n\n") : text).trim();

      if (!content) {
        throw new ExtractionError(
          `PDF appears to contain no extractable text (scanned/image PDF?): ${input}`
        );
      }

      // Derive a filename for metadata
      const filename = input.startsWith("/")
        ? input.split("/").pop() ?? "document.pdf"
        : new URL(input).pathname.split("/").pop() ?? "document.pdf";

      return {
        content,
        metadata: {
          title: filename,
          source: input,
          pages: String(totalPages),
        },
        provider: this.name,
      };
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(
        `PDF extraction failed for ${input}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }
}
