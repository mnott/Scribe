# Scribe — YouTube transcript extraction for Claude

Scribe is an MCP server that extracts transcripts and captions from YouTube videos, giving Claude the ability to read, summarize, and analyze video content without watching it.

Scribe speaks directly to YouTube's Innertube API using an Android client context — no API keys, no third-party services, no credentials to manage. It bypasses EU/GDPR consent gates automatically, handles both manual and auto-generated captions, and outputs transcripts in plain text, SRT subtitle format, or structured JSON with millisecond-accurate timing data.

## How It Works

```
Claude (AI client)
       |
       | MCP (stdio)
       v
  scribe-mcp server
       |
       |-- 1. Fetch youtube.com watch page (extract embedded JSON + cookies)
       |-- 2. POST /youtubei/v1/get_transcript (Android client context)
       |-- 3. Parse transcript segment list from API response
       |
       v
  Transcript returned to Claude
  (text / SRT / JSON with timing)
```

The server runs as a local process. Claude connects over stdio via the MCP protocol. No data leaves your machine except the requests to YouTube's own endpoints.

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

### Manual install (Claude Desktop)

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
| `youtube_transcribe` | Fetch the transcript for a YouTube video in text, SRT, or JSON format |
| `youtube_list_languages` | List every caption language available for a video |

## User Guide

Scribe gives Claude the ability to read YouTube videos as text. Just describe what you want in plain language.

### Get a transcript

```
Transcribe this YouTube video: https://www.youtube.com/watch?v=dQw4w9WgXcQ
```

```
Get the transcript of this talk: https://youtu.be/abc123xyz11
```

```
Can you read this video for me? https://youtube.com/shorts/def456uvw22
```

### Change the language

```
Get me the German transcript of this lecture: [url]
```

```
I need the Spanish subtitles for this video: [url]
```

```
Transcribe this video in French
```

### Discover available languages

```
What languages are available for this video? [url]
```

```
Does this talk have Japanese captions?
```

### Choose an output format

```
Give me the SRT subtitles for this video: [url]
```

```
Return the transcript as JSON with timing data: [url]
```

```
Get the transcript with timestamps included: [url]
```

### Ask Claude to analyze the content

```
Summarize this YouTube video: [url]
```

```
Extract the key points from this lecture: [url]
```

```
What are the main arguments made in this talk? [url]
```

```
Find every mention of "machine learning" in this video and the timestamp it appears: [url]
```

```
Translate the transcript of this video into English: [url]
```

## MCP Tool Reference

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

Scribe has no configuration file. All behavior is controlled by parameters passed per-request. The server runs on stdio and exits when the client disconnects.

**npx (Node.js):**

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

**bunx (Bun):**

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

**Local build:**

```json
{
  "mcpServers": {
    "scribe": {
      "command": "node",
      "args": ["/path/to/Scribe/dist/index.js"]
    }
  }
}
```

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

No API keys. No accounts. No external dependencies beyond the MCP SDK and Zod.

## Coming soon

- Vimeo transcript extraction
- Direct audio/video file transcription
- Podcast RSS feed support
- SoundCloud track transcription

## License

MIT

## Author

Matthias Nott — [github.com/mnott](https://github.com/mnott)
