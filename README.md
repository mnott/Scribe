---
links: "[[Ideaverse/AI/Scribe/Scribe|Scribe]]"
---

# Scribe — Content extraction for Claude

Scribe is an MCP server that extracts content from multiple sources — YouTube videos, web articles, PDFs, and Claude.ai conversations — giving Claude the ability to read and work with content from anywhere.

**4 providers, one tool:** `extract_content` auto-detects the source type and routes to the right provider. YouTube transcripts come from the Innertube API (no API keys needed), articles use Readability extraction, PDFs are parsed locally, and Claude.ai conversations are downloaded directly from the web UI API.

## How It Works

```
Claude (AI client)
       |
       | MCP (stdio)
       v
  scribe-mcp server
       |
       |-- extract_content auto-routes by URL:
       |     youtube.com/*  → YouTube provider (Innertube API)
       |     claude.ai/*    → Claude provider (web UI API)
       |     *.pdf          → PDF provider (local parsing)
       |     any other URL  → Article provider (Readability)
       |
       v
  Clean text/markdown returned to Claude
```

The server runs as a local process. Claude connects over stdio via the MCP protocol.

## Quick Start

### Prerequisites

- [Claude Desktop](https://claude.ai/download) or [Claude Code](https://claude.ai/code)
- [Node.js](https://nodejs.org) 18+ **or** [Bun](https://bun.sh) 1.0+

### Install with Claude Code

Tell Claude:

> *"Install the scribe MCP server from github.com/mnott/Scribe"*

Claude will clone the repo, build it, and add it to your MCP config.

Or use the CLI directly:

```bash
claude mcp add scribe-mcp -- npx -y @tekmidian/scribe
```

### Manual install

#### Claude Code

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "scribe": {
      "command": "npx",
      "args": ["-y", "scribe-mcp"]
    }
  }
}
```

Or with Bun (faster):

```json
{
  "mcpServers": {
    "scribe": {
      "command": "bunx",
      "args": ["scribe-mcp"]
    }
  }
}
```

#### Claude Desktop

Add the following to your `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "scribe": {
      "command": "npx",
      "args": ["-y", "scribe-mcp"]
    }
  }
}
```

Or with Bun:

```json
{
  "mcpServers": {
    "scribe": {
      "command": "bunx",
      "args": ["scribe-mcp"]
    }
  }
}
```

### Build from source

```bash
git clone https://github.com/mnott/Scribe
cd Scribe
bun install
bun run build
```

Then point your MCP config at the built binary:

```json
{
  "mcpServers": {
    "scribe": {
      "command": "node",
      "args": ["/absolute/path/to/Scribe/dist/index.js"]
    }
  }
}
```

## Tools at a Glance

| Tool | What it does |
|------|-------------|
| `extract_content` | Extract content from any supported source — auto-detects the provider |
| `list_providers` | Show all available providers and their capabilities |
| `youtube_transcribe` | Fetch YouTube transcript in text, SRT, or JSON format |
| `youtube_list_languages` | List every caption language available for a video |

## Providers

| Provider | Sources | Output |
|----------|---------|--------|
| **youtube** | YouTube videos (all URL formats + bare IDs) | Text, SRT, JSON with timing |
| **claude** | Claude.ai chats and projects | Markdown with metadata |
| **pdf** | PDF files (URLs or local paths) | Plain text |
| **article** | Any web page | Clean text via Readability |

## User Guide

Just give Claude a URL. Scribe auto-detects the source type.

### YouTube videos

```
Summarize this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

```
Get me the German transcript of this lecture: [url]
```

```
Return the transcript as JSON with timing data: [url]
```

### Claude.ai conversations

```
Download this conversation: https://claude.ai/chat/550e8400-e29b-41d4-a716-446655440000
```

```
Get all conversations from this project: https://claude.ai/project/550e8400-e29b-41d4-a716-446655440000
```

### Web articles

```
Extract the content from this article: https://example.com/interesting-post
```

### PDFs

```
Read this PDF: https://example.com/paper.pdf
```

```
Extract text from /Users/me/Documents/report.pdf
```

### Analyze anything

```
Summarize this: [any supported URL]
```

```
Extract the key points from this: [any supported URL]
```

## Claude.ai Provider Setup

The Claude provider downloads conversations from the Claude.ai web UI. It requires a session cookie for authentication. Three options:

**Option A — Playwright (automated, recommended if you have Playwright MCP):**

Ask Claude Code to navigate to claude.ai and extract cookies:

```
Navigate to claude.ai and extract all cookies, save them as JSON to ~/claude-cookies.json
```

Then add to your MCP config:

```json
{
  "mcpServers": {
    "scribe": {
      "command": "npx",
      "args": ["-y", "@tekmidian/scribe"],
      "env": {
        "CLAUDE_COOKIES_FILE": "/Users/you/claude-cookies.json"
      }
    }
  }
}
```

**Option B — Browser extension:**

Install a cookie export extension (e.g. "Cookie-Editor"), export claude.ai cookies as JSON, and set `CLAUDE_COOKIES_FILE` as above.

**Option C — Manual:**

Open claude.ai → F12 → Application → Cookies → copy the `sessionKey` value:

```json
{
  "env": {
    "CLAUDE_SESSION_KEY": "sk-ant-sid01-..."
  }
}
```

Without either env var, the Claude provider is silently disabled — other providers still work normally.

## MCP Tool Reference

### extract_content

Extracts content from any supported source. Auto-detects the provider based on the URL.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | yes | — | URL or file path to extract content from |
| `format` | string | no | `text` | Output format (available formats depend on provider) |
| `language` | string | no | — | Preferred language code (YouTube only) |
| `timestamps` | boolean | no | `false` | Include timestamps (YouTube text format only) |

### list_providers

Lists all available providers and their capabilities. No parameters.

### youtube_transcribe

Fetches captions for a YouTube video and returns them in the requested format.

Supports `youtube.com/watch`, `youtu.be`, `youtube.com/shorts`, `youtube.com/embed`, and bare 11-character video IDs.

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `url` | string | yes | — | YouTube video URL or bare video ID |
| `language` | string | no | `en` | BCP-47 language code (`en`, `de`, `fr`, `ja`, …) |
| `format` | string | no | `text` | Output format: `text`, `srt`, or `json` |
| `timestamps` | boolean | no | `false` | Prepend `[MM:SS]` timestamps to each line (text format only) |

**Output formats**

- `text` — Clean continuous prose. Add `timestamps: true` for `[MM:SS]` prefixes on each segment.
- `srt` — Standard SubRip format, ready to use as a subtitle file.
- `json` — Array of objects with `text`, `startMs`, and `durationMs` fields for precise timing.

**Response includes a metadata header:**

```
Video ID: dQw4w9WgXcQ
Language: en (auto-generated)
Format: text

[transcript body follows]
```

### youtube_list_languages

Lists every caption track available for a video, distinguishing manual captions from auto-generated ones.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `url` | string | yes | YouTube video URL or bare video ID |

**Example output:**

```
Available languages for dQw4w9WgXcQ:

- en: English (manual)
- de: German (auto-generated)
- fr: French (auto-generated)
- ja: Japanese (auto-generated)
```

## Configuration

All behavior is controlled by parameters passed per-request. Optional environment variables enable the Claude.ai provider:

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_COOKIES_FILE` | no | Path to browser cookie export JSON (claude.ai provider) |
| `CLAUDE_SESSION_KEY` | no | Direct session key value (claude.ai provider) |
| `CLAUDE_ORG_ID` | no | Organization ID (auto-discovered if not set) |

## Troubleshooting

**"This video does not have captions available"**

The video creator has disabled captions, and YouTube has not generated automatic captions for it. This is common for very new uploads (auto-captions can take hours), music videos, videos with no speech, or videos where the creator has explicitly disabled the feature. Nothing can be done — there are no captions to extract.

**"Language not available — supported: en, de, fr"**

The language code you requested does not have a caption track. Use `youtube_list_languages` first to see what is available, then retry with a supported code.

**Geo-restricted content**

If a video is only available in certain countries, Scribe may receive a `VIDEO_NOT_AVAILABLE` or similar playability error from YouTube. The server reports this clearly. There is no workaround — the restriction is enforced by YouTube's servers, not by Scribe.

**Age-restricted content**

Age-restricted videos require a logged-in session to view. Scribe does not support authenticated sessions. Age-restricted videos will fail with a playability status error. Transcript extraction is not possible for these videos without a cookie-based session, which Scribe intentionally does not implement.

**Rate limiting / HTTP 429**

If you transcribe many videos in rapid succession, YouTube may temporarily throttle requests. Wait a few minutes before retrying. Scribe does not implement retry logic or backoff — this is left to the caller.

## Requirements

- Node.js 18 or later (for `npx` usage), **or** Bun 1.0 or later (for `bunx` usage)
- An MCP-compatible client (Claude Desktop, Claude Code, or any MCP-aware host)
- Internet access to reach `youtube.com` and `www.youtube.com/youtubei/v1/`

No API keys needed for YouTube, articles, or PDFs. Claude.ai provider requires a session cookie (see setup above).

## Coming soon

- Vimeo transcript extraction
- Direct audio/video file transcription
- Podcast RSS feed support

## License

MIT

## Author

Matthias Nott — [github.com/mnott](https://github.com/mnott)

---
*Links:* [[Ideaverse/AI/Scribe/Scribe|Scribe]]
