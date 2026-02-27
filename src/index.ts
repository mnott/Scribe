import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerYoutubeTranscribeTool } from "./tools/youtube-transcribe.ts";

const server = new McpServer({
  name: "scribe",
  version: "0.1.0",
});

registerYoutubeTranscribeTool(server);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[scribe] MCP server running on stdio");
}

main().catch((err: unknown) => {
  console.error("[scribe] Fatal error:", err);
  process.exit(1);
});
