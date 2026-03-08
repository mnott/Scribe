import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerYoutubeTranscribeTool } from "./tools/youtube-transcribe.ts";
import { registerExtractTools } from "./tools/extract.ts";
import { registry } from "./registry.ts";
import { YouTubeProvider } from "./providers/youtube.ts";
import { ClaudeProvider } from "./providers/claude.ts";
import { PdfProvider } from "./providers/pdf.ts";
import { ArticleProvider } from "./providers/article.ts";

// Register providers in priority order: specific before catch-all
registry.register(new YouTubeProvider());
registry.register(new ClaudeProvider());
registry.register(new PdfProvider());
registry.register(new ArticleProvider());

const server = new McpServer(
  {
    name: "scribe",
    version: "0.2.1",
  },
  {
    instructions: [
      "## Scribe MCP — Content Extraction",
      "",
      "Extracts content from multiple sources. 4 providers: YouTube, Claude.ai, PDF, Article.",
      "",
      "USE WHEN: user mentions scribe OR youtube transcribe OR transcription OR transcribe video",
      "OR youtube captions OR media transcription OR extract content OR get article OR read pdf",
      "OR download conversation OR claude chat download.",
      "",
      "### Providers",
      "",
      "| Provider    | Handles                              | Auth                                    |",
      "|-------------|--------------------------------------|-----------------------------------------|",
      "| youtube     | YouTube URLs, bare video IDs         | None needed                             |",
      "| claude      | claude.ai/chat/*, claude.ai/project/* | CLAUDE_COOKIES_FILE or CLAUDE_SESSION_KEY |",
      "| pdf         | .pdf URLs and local paths            | None needed                             |",
      "| article     | Any other HTTP(S) URL                | None needed                             |",
      "",
      "### Usage Examples",
      "",
      "- Summarize article: `extract_content` auto-detects the article provider",
      "- YouTube transcript: `youtube_transcribe` or `extract_content` (both work)",
      "- Claude.ai conversation: `extract_content` with a claude.ai/chat/... URL → returns markdown",
      "- Claude.ai project: `extract_content` with a claude.ai/project/... URL → combined markdown with TOC",
      "- PDF extraction: `extract_content` with a .pdf path or URL",
      "",
      "### Tools",
      "",
      "| Tool                        | Purpose                          |",
      "|-----------------------------|----------------------------------|",
      "| `extract_content`           | Extract from any URL or path (auto-detects provider) |",
      "| `list_providers`            | List available providers         |",
      "| `youtube_transcribe`        | Transcribe a YouTube video       |",
      "| `youtube_list_languages`    | List available caption languages |",
    ].join("\n"),
  },
);

registerYoutubeTranscribeTool(server);
registerExtractTools(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[scribe] MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("[scribe] Fatal error:", err);
  process.exit(1);
});
