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

const server = new McpServer({
  name: "scribe",
  version: "0.2.1",
});

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
