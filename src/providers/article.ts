import { extract } from "@extractus/article-extractor";
import type {
  ContentProvider,
  ExtractionOptions,
  ExtractionResult,
  ProviderCapabilities,
} from "../types.ts";
import { ExtractionError } from "../lib/errors.ts";

export class ArticleProvider implements ContentProvider {
  readonly name = "article";
  readonly description = "Extracts clean article content from web pages using Readability";

  canHandle(input: string): boolean {
    try {
      const url = new URL(input);
      if (url.protocol !== "http:" && url.protocol !== "https:") return false;

      // Don't handle YouTube URLs (YouTubeProvider takes those)
      const hostname = url.hostname.replace(/^www\./, "");
      if (hostname === "youtube.com" || hostname === "m.youtube.com" || hostname === "youtu.be") {
        return false;
      }

      // Don't handle direct PDF URLs (PdfProvider takes those)
      if (url.pathname.toLowerCase().endsWith(".pdf")) {
        return false;
      }

      return true;
    } catch {
      return false;
    }
  }

  capabilities(): ProviderCapabilities {
    return {
      formats: ["text", "markdown"],
      supportsLanguage: false,
      supportsTimestamps: false,
    };
  }

  async extract(input: string, options: ExtractionOptions = {}): Promise<ExtractionResult> {
    const { format = "text" } = options;

    try {
      const article = await extract(input);

      if (!article) {
        throw new ExtractionError(`Could not extract article content from: ${input}`);
      }

      let content: string;
      if (format === "markdown" || format === "text") {
        // article-extractor returns HTML content; strip tags for text
        content = article.content
          ? stripHtml(article.content)
          : "No content could be extracted.";
      } else {
        // For json/srt, fall back to text
        content = article.content
          ? stripHtml(article.content)
          : "No content could be extracted.";
      }

      return {
        content,
        metadata: {
          title: article.title ?? undefined,
          author: article.author ?? undefined,
          date: article.published ?? undefined,
          source: article.url ?? input,
          description: article.description ?? undefined,
        },
        provider: this.name,
      };
    } catch (err) {
      if (err instanceof ExtractionError) throw err;
      throw new ExtractionError(
        `Article extraction failed for ${input}: ${err instanceof Error ? err.message : String(err)}`,
        err
      );
    }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/h[1-6]>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
