import type {
  ContentProvider,
  ExtractionOptions,
  ExtractionResult,
  ProviderCapabilities,
} from "../types.ts";
import {
  createClaudeClient,
  fetchConversation,
  fetchMultipleConversations,
  formatConversationMarkdown,
  listProjectConversations,
  resolveSessionKey,
} from "../lib/claude-api.ts";
import { ClaudeAuthError } from "../lib/errors.ts";

/** Matches claude.ai/chat/{UUID} */
const CHAT_RE = /claude\.ai\/chat\/([0-9a-f-]{36})/i;
/** Matches claude.ai/project/{UUID} */
const PROJECT_RE = /claude\.ai\/project\/([0-9a-f-]{36})/i;

export class ClaudeProvider implements ContentProvider {
  readonly name = "claude";
  readonly description =
    "Downloads conversations from Claude.ai (web UI chats and projects)";

  canHandle(input: string): boolean {
    if (!process.env.CLAUDE_SESSION_KEY && !process.env.CLAUDE_COOKIES_FILE) return false;
    return CHAT_RE.test(input) || PROJECT_RE.test(input);
  }

  capabilities(): ProviderCapabilities {
    return {
      formats: ["markdown"],
      supportsLanguage: false,
      supportsTimestamps: false,
    };
  }

  async extract(
    input: string,
    _options: ExtractionOptions = {},
  ): Promise<ExtractionResult> {
    const sessionKey = await resolveSessionKey();
    if (!sessionKey) {
      throw new ClaudeAuthError(
        "Claude.ai session key not found. Configure one of:\n" +
          "Option A — Playwright (automated, recommended if you have Playwright MCP):\n" +
          '  1. Ask Claude Code: "navigate to claude.ai and extract cookies"\n' +
          "  2. Playwright runs: page.context().cookies('https://claude.ai')\n" +
          "  3. Save the result as JSON and set CLAUDE_COOKIES_FILE in your MCP config\n" +
          "Option B — Browser extension:\n" +
          '  1. Install "Cookie-Editor" extension, export claude.ai cookies as JSON\n' +
          '  2. Add to MCP config: "env": { "CLAUDE_COOKIES_FILE": "/path/to/cookies.json" }\n' +
          "Option C — Manual:\n" +
          "  1. Open claude.ai → F12 → Application → Cookies → copy sessionKey value\n" +
          '  2. Add to MCP config: "env": { "CLAUDE_SESSION_KEY": "sk-ant-sid01-..." }',
      );
    }

    let client;
    try {
      client = await createClaudeClient(sessionKey);
    } catch (err) {
      throw new ClaudeAuthError(
        err instanceof Error ? err.message : String(err),
      );
    }

    // Chat URL
    const chatMatch = input.match(CHAT_RE);
    if (chatMatch) {
      const chatId = chatMatch[1];
      const data = await fetchConversation(client, chatId);
      const content = formatConversationMarkdown(data);
      return {
        content,
        metadata: {
          title: data.name ?? "Untitled",
          source: `https://claude.ai/chat/${chatId}`,
          model: data.model,
        },
        provider: this.name,
      };
    }

    // Project URL
    const projectMatch = input.match(PROJECT_RE);
    if (projectMatch) {
      const projectId = projectMatch[1];
      const conversations = await listProjectConversations(client, projectId);

      if (!conversations.length) {
        return {
          content: "No conversations found in this project.",
          metadata: {
            title: "Empty project",
            source: `https://claude.ai/project/${projectId}`,
          },
          provider: this.name,
        };
      }

      const chatIds = conversations.map((c) => c.uuid);
      const results = await fetchMultipleConversations(client, chatIds);

      // Build table of contents
      const tocLines: string[] = [
        `# Project Conversations (${results.length})`,
        "",
      ];
      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        const title = r.data.name ?? "Untitled";
        tocLines.push(`${i + 1}. [${title}](#${slugify(title)})`);
      }
      tocLines.push("", "---", "");

      // Combine all conversations
      const sections = results.map((r) => formatConversationMarkdown(r.data));
      const content = tocLines.join("\n") + sections.join("\n\n---\n\n");

      return {
        content,
        metadata: {
          title: `Project with ${results.length} conversations`,
          source: `https://claude.ai/project/${projectId}`,
          conversationCount: String(results.length),
        },
        provider: this.name,
      };
    }

    // Should not reach here given canHandle, but just in case
    throw new Error(`Unrecognized Claude.ai URL: ${input}`);
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
