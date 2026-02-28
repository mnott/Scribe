import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { registry } from "../registry.ts";
import { ProviderNotFoundError, ExtractionError, ScribeError } from "../lib/errors.ts";
import type { OutputFormat } from "../types.ts";

export function registerExtractTools(server: McpServer): void {
  server.tool(
    "extract_content",
    "Extract content from any supported source (web articles, PDFs, YouTube videos). Automatically detects the content type and uses the appropriate provider.",
    {
      url: z
        .string()
        .describe("URL or file path to extract content from (e.g. https://example.com/article, /path/to/file.pdf, https://youtu.be/VIDEO_ID)"),
      format: z
        .enum(["text", "markdown", "json", "srt"])
        .optional()
        .default("text")
        .describe("Output format. Available formats depend on the provider. Defaults to 'text'."),
      language: z
        .string()
        .optional()
        .describe("Preferred language code (e.g. 'en', 'es'). Only supported by some providers."),
      timestamps: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include timestamps in output. Only supported by some providers."),
    },
    async (params) => {
      const { url, format, language, timestamps } = params;

      console.error(`[scribe] extract_content called: url=${url} format=${format} lang=${language ?? "default"}`);

      const provider = registry.resolve(url);
      if (!provider) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: new ProviderNotFoundError(url).message,
            },
          ],
        };
      }

      try {
        const result = await provider.extract(url, {
          format: format as OutputFormat,
          language,
          timestamps,
        });

        // Build metadata header
        const metaLines: string[] = [];
        if (result.metadata.title) metaLines.push(`Title: ${result.metadata.title}`);
        if (result.metadata.author) metaLines.push(`Author: ${result.metadata.author}`);
        if (result.metadata.date) metaLines.push(`Date: ${result.metadata.date}`);
        if (result.metadata.source) metaLines.push(`Source: ${result.metadata.source}`);
        metaLines.push(`Provider: ${result.provider}`);
        metaLines.push("");

        return {
          content: [
            {
              type: "text" as const,
              text: metaLines.join("\n") + result.content,
            },
          ],
        };
      } catch (err) {
        console.error(`[scribe] Error extracting from ${url}:`, err);
        const message =
          err instanceof ScribeError
            ? err.message
            : err instanceof Error
              ? `Extraction failed: ${err.message}`
              : "An unknown error occurred during extraction.";
        return {
          isError: true,
          content: [{ type: "text" as const, text: message }],
        };
      }
    }
  );

  server.tool(
    "list_providers",
    "List all available content extraction providers and their capabilities.",
    {},
    async () => {
      const providers = registry.list();

      const lines = providers.map((p) => {
        const caps = p.capabilities;
        const parts = [
          `  Formats: ${caps.formats.join(", ")}`,
          `  Language selection: ${caps.supportsLanguage ? "yes" : "no"}`,
          `  Timestamps: ${caps.supportsTimestamps ? "yes" : "no"}`,
        ];
        return `**${p.name}** — ${p.description}\n${parts.join("\n")}`;
      });

      return {
        content: [
          {
            type: "text" as const,
            text: `Available providers (${providers.length}):\n\n${lines.join("\n\n")}`,
          },
        ],
      };
    }
  );
}
