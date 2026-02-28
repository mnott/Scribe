/**
 * Claude.ai API client — ported from Python scripts (download_chats.py, fix_artifacts.py).
 * Handles authentication, conversation fetching, and markdown formatting.
 */

const BASE_URL = "https://claude.ai";
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36";
const REQUEST_DELAY_MS = 500;

export interface ClaudeClient {
  headers: Record<string, string>;
  orgId: string;
}

/**
 * Resolve the session key from env vars.
 * Supports: CLAUDE_SESSION_KEY (direct) or CLAUDE_COOKIES_FILE (browser extension export).
 */
export async function resolveSessionKey(): Promise<string | null> {
  if (process.env.CLAUDE_SESSION_KEY) {
    return process.env.CLAUDE_SESSION_KEY;
  }
  const cookiesFile = process.env.CLAUDE_COOKIES_FILE;
  if (cookiesFile) {
    try {
      const file = Bun.file(cookiesFile);
      const cookies = (await file.json()) as Array<{ name: string; value: string }>;
      const entry = cookies.find((c) => c.name === "sessionKey");
      if (entry?.value) return entry.value;
    } catch {
      // Fall through
    }
  }
  return null;
}

/**
 * Create a configured Claude.ai API client.
 * Auto-discovers org ID if not provided via env.
 */
export async function createClaudeClient(sessionKey: string): Promise<ClaudeClient> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
    Referer: "https://claude.ai/",
    Origin: "https://claude.ai",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-origin",
    Cookie: `sessionKey=${sessionKey}`,
  };

  let orgId = process.env.CLAUDE_ORG_ID ?? "";
  if (!orgId) {
    orgId = await discoverOrgId(headers);
  }

  return { headers, orgId };
}

/**
 * Auto-discover the organization ID from the Claude.ai API.
 */
async function discoverOrgId(headers: Record<string, string>): Promise<string> {
  const resp = await fetch(`${BASE_URL}/api/organizations`, { headers });
  if (!resp.ok) {
    throw new Error(
      `Failed to discover org ID (HTTP ${resp.status}). ` +
        `Your session key is likely expired. Refresh it: F12 → Application → Cookies → claude.ai → copy sessionKey.`
    );
  }
  const orgs = (await resp.json()) as Array<{ uuid: string }>;
  if (!orgs.length) {
    throw new Error("No organizations found for this session key.");
  }
  return orgs[0].uuid;
}

/**
 * Fetch a single conversation with full rendered content blocks.
 */
export async function fetchConversation(
  client: ClaudeClient,
  chatId: string,
): Promise<ConversationData> {
  const url = `${BASE_URL}/api/organizations/${client.orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`;
  const resp = await fetch(url, { headers: client.headers });
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(
      `Authentication failed (HTTP ${resp.status}). ` +
        `Your session key may be expired — refresh it from DevTools → Application → Cookies → claude.ai → sessionKey.`
    );
  }
  if (!resp.ok) {
    throw new Error(`Failed to fetch conversation ${chatId} (HTTP ${resp.status})`);
  }
  return (await resp.json()) as ConversationData;
}

/**
 * List all conversations in a project (handles pagination).
 */
export async function listProjectConversations(
  client: ClaudeClient,
  projectId: string,
): Promise<ProjectConversation[]> {
  const all: ProjectConversation[] = [];
  let offset = 0;
  const limit = 50;

  while (true) {
    const url =
      `${BASE_URL}/api/organizations/${client.orgId}/projects/${projectId}/conversations_v2` +
      `?limit=${limit}&offset=${offset}`;
    const resp = await fetch(url, { headers: client.headers });
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(
        `Authentication failed (HTTP ${resp.status}). ` +
          `Your session key is likely expired. Refresh it: F12 → Application → Cookies → claude.ai → copy sessionKey.`
      );
    }
    if (!resp.ok) {
      throw new Error(`Failed to list project conversations (HTTP ${resp.status})`);
    }
    const body = (await resp.json()) as { data: ProjectConversation[]; pagination: { has_more: boolean } };
    all.push(...body.data);
    if (!body.pagination?.has_more) break;
    offset += limit;
    await sleep(REQUEST_DELAY_MS);
  }

  return all;
}

/**
 * Fetch multiple conversations with a delay between each.
 * Returns array of [chatId, data] tuples; skips failures.
 */
export async function fetchMultipleConversations(
  client: ClaudeClient,
  chatIds: string[],
): Promise<Array<{ chatId: string; data: ConversationData }>> {
  const results: Array<{ chatId: string; data: ConversationData }> = [];
  for (let i = 0; i < chatIds.length; i++) {
    if (i > 0) {
      await sleep(REQUEST_DELAY_MS);
    }
    try {
      const data = await fetchConversation(client, chatIds[i]);
      results.push({ chatId: chatIds[i], data });
    } catch (err) {
      console.error(
        `[scribe] Failed to fetch conversation ${chatIds[i]}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }
  return results;
}

// ---------------------------------------------------------------------------
// Markdown formatting — ported from fix_artifacts.py
// ---------------------------------------------------------------------------

/**
 * Format a single content block from the rendered API response.
 */
function formatContentBlock(block: ContentBlock): string {
  const btype = block.type ?? "";

  if (btype === "text") {
    return block.text ?? "";
  }

  if (btype === "tool_use") {
    const name = block.name ?? "unknown_tool";
    const inp = (block.input ?? {}) as Record<string, string>;

    if (name === "create_file") {
      const fpath = inp.path ?? inp.file_path ?? "";
      const fname = fpath.split("/").pop() ?? fpath;
      const fileText = inp.file_text ?? "";
      // Inline the artifact content since Scribe returns a single string
      if (fileText) {
        return `\n> **Created file:** \`${fname}\`\n> \`\`\`\n${fileText}\n> \`\`\`\n`;
      }
      return `\n> **Created file:** \`${fname}\`\n`;
    }
    if (name === "present_files") return "";
    if (name === "project_knowledge_search") {
      const query = inp.query ?? "";
      return `\n> **Searched project:** "${query}"\n`;
    }
    if (name === "bash" || name === "run_command") {
      const cmd = inp.command ?? "";
      return `\n\`\`\`bash\n${cmd}\n\`\`\`\n`;
    }
    return `\n> **Tool:** ${name}\n`;
  }

  if (btype === "tool_result") return "";

  return "";
}

/**
 * Format a single message using rendered content blocks.
 * Attachment contents are inlined (Scribe returns a single string, not files).
 */
function formatMessage(msg: ChatMessage): string {
  const sender = msg.sender ?? "unknown";
  const created = msg.created_at ?? "";

  let header = sender === "human" ? "## Human" : "## Assistant";
  if (created) {
    try {
      const dt = new Date(created);
      header += ` (${dt.toISOString().replace("T", " ").replace(/\.\d+Z$/, " UTC")})`;
    } catch {
      // skip
    }
  }

  const parts: string[] = [header, ""];

  // Inline attachment contents
  for (const key of ["attachments", "files", "files_v2"] as const) {
    const items = (msg as Record<string, Attachment[]>)[key];
    if (!Array.isArray(items)) continue;
    for (const att of items) {
      const display = att.file_name ?? att.name ?? "attachment";
      const content = att.extracted_content ?? att.content ?? "";
      if (content) {
        parts.push(`\n<details><summary>Attachment: ${display}</summary>\n\n${content}\n\n</details>\n`);
      } else {
        parts.push(`- Attachment: \`${display}\``);
      }
    }
  }

  const contentBlocks = msg.content;
  if (Array.isArray(contentBlocks)) {
    for (const block of contentBlocks) {
      const text = formatContentBlock(block);
      if (text) parts.push(text);
    }
  } else {
    // Fallback to text field
    parts.push(msg.text ?? "");
  }

  parts.push("");
  return parts.join("\n");
}

/**
 * Format an entire conversation as markdown.
 */
export function formatConversationMarkdown(data: ConversationData): string {
  const title = data.name ?? "Untitled";
  const created = data.created_at ?? "";
  const updated = data.updated_at ?? "";
  const model = data.model ?? "unknown";

  const parts: string[] = [
    `# ${title}`,
    "",
    `- **Created:** ${created}`,
    `- **Updated:** ${updated}`,
    `- **Model:** ${model}`,
    `- **Chat ID:** ${data.uuid ?? ""}`,
    "",
    "---",
    "",
  ];

  const messages = [...(data.chat_messages ?? [])];
  messages.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));

  for (const msg of messages) {
    parts.push(formatMessage(msg));
  }

  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Types — minimal shapes matching the Claude.ai API response
// ---------------------------------------------------------------------------

export interface ConversationData {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  model?: string;
  chat_messages?: ChatMessage[];
}

export interface ChatMessage {
  sender?: string;
  created_at?: string;
  index?: number;
  text?: string;
  content?: ContentBlock[];
  attachments?: Attachment[];
  files?: Attachment[];
  files_v2?: Attachment[];
}

interface ContentBlock {
  type?: string;
  text?: string;
  name?: string;
  input?: Record<string, unknown>;
}

interface Attachment {
  file_name?: string;
  name?: string;
  id?: string;
  extracted_content?: string;
  content?: string;
}

export interface ProjectConversation {
  uuid: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
