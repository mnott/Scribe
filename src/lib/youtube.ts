import {
  VideoNotFoundError,
  CaptionsDisabledError,
  LanguageNotAvailableError,
  TranscriptionError,
} from "./errors.ts";

const USER_AGENT_WEB =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const USER_AGENT_ANDROID =
  "com.google.android.youtube/19.47.37 (Linux; U; Android 14) gzip";

const ANDROID_CLIENT_VERSION = "19.47.37";
const ANDROID_CLIENT_NAME = "ANDROID";
const ANDROID_SDK_VERSION = 34;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TranscriptSegmentRenderer {
  startMs?: string;
  endMs?: string;
  snippet?: {
    elementsAttributedString?: { content?: string };
    runs?: { text?: string }[];
  };
  startTimeText?: {
    elementsAttributedString?: { content?: string };
  };
}

interface TranscriptSegmentItem {
  transcriptSegmentRenderer?: TranscriptSegmentRenderer;
}

interface TranscriptApiResponse {
  actions?: {
    elementsCommand?: {
      transformEntityCommand?: {
        arguments?: {
          transformTranscriptSegmentListArguments?: {
            overwrite?: {
              initialSegments?: TranscriptSegmentItem[];
            };
          };
        };
      };
    };
  }[];
  responseContext?: Record<string, unknown>;
}

// Language list response types
interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  kind?: string;
  name?: { simpleText?: string };
}

interface PlayerResponse {
  captions?: {
    playerCaptionsTracklistRenderer?: {
      captionTracks?: CaptionTrack[];
    };
  };
  playabilityStatus?: {
    status?: string;
    reason?: string;
  };
}

// ytInitialData engagement panel types
interface EngagementPanelSectionListRenderer {
  panelIdentifier?: string;
  [key: string]: unknown;
}

interface EngagementPanel {
  engagementPanelSectionListRenderer?: EngagementPanelSectionListRenderer;
}

interface InitialData {
  engagementPanels?: EngagementPanel[];
  [key: string]: unknown;
}

// Output types
export interface TranscriptSegment {
  text: string;
  startMs: number;
  durationMs: number;
}

export type TranscriptFormat = "text" | "srt" | "json";

// ---------------------------------------------------------------------------
// Video ID extraction
// ---------------------------------------------------------------------------

export function extractVideoId(input: string): string | null {
  const trimmed = input.trim();

  // Already a bare video ID (11 chars, alphanumeric + - _)
  if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
    return trimmed;
  }

  try {
    const url = new URL(
      trimmed.startsWith("http") ? trimmed : `https://${trimmed}`
    );

    const hostname = url.hostname.replace(/^www\./, "");

    // youtu.be/<id>
    if (hostname === "youtu.be") {
      const id = url.pathname.slice(1).split("/")[0];
      if (id && /^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    // youtube.com/watch?v=<id>
    if (hostname === "youtube.com" || hostname === "m.youtube.com") {
      const v = url.searchParams.get("v");
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;

      // youtube.com/shorts/<id>, /embed/<id>, /v/<id>
      const pathMatch = url.pathname.match(
        /^\/(shorts|embed|v)\/([a-zA-Z0-9_-]{11})/
      );
      if (pathMatch?.[2]) return pathMatch[2];
    }
  } catch {
    // Not a valid URL — fall through
  }

  // Last-resort regex for partial URLs or unusual formats
  const match = trimmed.match(
    /(?:v=|\/(?:embed|v|shorts)\/)([a-zA-Z0-9_-]{11})/
  );
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Fetch YouTube page and extract embedded JSON data
// ---------------------------------------------------------------------------

interface PageData {
  playerResponse: PlayerResponse | null;
  initialData: InitialData | null;
  visitorData: string | null;
  clientVersion: string;
  cookies: string;
}

async function fetchPageData(videoId: string): Promise<PageData> {
  const url = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;

  let html: string;
  const responseHeaders: [string, string][] = [];

  try {
    const resp = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT_WEB,
        "Accept-Language": "en-US,en;q=0.9",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        // Bypass GDPR consent gate (works for most EU regions)
        Cookie: "CONSENT=YES+cb.20210328-17-p0.en+FX+000",
      },
    });

    if (!resp.ok) {
      throw new TranscriptionError(
        `HTTP ${resp.status} fetching YouTube page for video ${videoId}`
      );
    }

    // Collect session cookies for subsequent API calls
    resp.headers.forEach((value, name) => {
      responseHeaders.push([name, value]);
    });

    html = await resp.text();
  } catch (err) {
    if (err instanceof TranscriptionError) throw err;
    throw new TranscriptionError(
      `Network error fetching YouTube page for video ${videoId}`,
      err
    );
  }

  // Collect cookies for the API call
  const cookieParts = ["CONSENT=YES+cb.20210328-17-p0.en+FX+000"];
  for (const [name, value] of responseHeaders) {
    if (name.toLowerCase() === "set-cookie") {
      const cookiePart = value.split(";")[0];
      if (cookiePart) cookieParts.push(cookiePart);
    }
  }
  const cookies = cookieParts.join("; ");

  // Extract ytInitialPlayerResponse
  let playerResponse: PlayerResponse | null = null;
  const playerMatch = html.match(
    /var ytInitialPlayerResponse\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script>)/s
  );
  if (playerMatch?.[1]) {
    try {
      playerResponse = JSON.parse(playerMatch[1]) as PlayerResponse;
    } catch {
      // Ignore parse errors
    }
  }

  // Extract ytInitialData (for transcript panel)
  let initialData: InitialData | null = null;
  const dataMatch = html.match(
    /var ytInitialData\s*=\s*(\{.+?\});\s*(?:var|const|let|<\/script>)/s
  );
  if (dataMatch?.[1]) {
    try {
      initialData = JSON.parse(dataMatch[1]) as InitialData;
    } catch {
      // Ignore parse errors
    }
  }

  // Extract visitorData and client version
  const visitorDataMatch = html.match(/"visitorData":"([^"]+)"/);
  const clientVersionMatch = html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/);

  return {
    playerResponse,
    initialData,
    visitorData: visitorDataMatch?.[1] ?? null,
    clientVersion: clientVersionMatch?.[1] ?? "2.20241121.01.00",
    cookies,
  };
}

// ---------------------------------------------------------------------------
// Extract transcript params from engagement panel
// ---------------------------------------------------------------------------

function extractTranscriptParams(
  initialData: InitialData
): string | null {
  const panels = initialData.engagementPanels ?? [];

  const transcriptPanel = panels.find(
    (p) =>
      p.engagementPanelSectionListRenderer?.panelIdentifier ===
      "engagement-panel-searchable-transcript"
  );

  if (!transcriptPanel) return null;

  // Find getTranscriptEndpoint.params in the panel JSON
  const panelStr = JSON.stringify(transcriptPanel);
  const match = panelStr.match(/"getTranscriptEndpoint":\{"params":"([^"]+)"/);
  return match?.[1] ?? null;
}

// ---------------------------------------------------------------------------
// Build transcript params proto for a specific language
// ---------------------------------------------------------------------------
// Proto structure (based on reverse engineering):
// field 1 (0x0a): video ID (string)
// field 2 (0x12): nested proto {field1:'', field2: langCode, field3:''} URL-encoded base64
// field 3 (0x18): int 1
// field 5 (0x2a): panel identifier string
// field 6 (0x30): int 1
// field 7 (0x38): int 1
// field 8 (0x40): int 1

function buildLangProto(langCode: string): string {
  // Inner proto: field2 = langCode
  const langBytes = Buffer.from(langCode, "utf8");
  const inner = Buffer.concat([
    Buffer.from([0x0a, 0x00]), // field 1 = empty string
    Buffer.from([0x12, langBytes.length]), // field 2 = langCode
    langBytes,
    Buffer.from([0x1a, 0x00]), // field 3 = empty string
  ]);
  // URL-encode it (matching what YouTube expects in the proto)
  return encodeURIComponent(inner.toString("base64"));
}

function buildTranscriptParams(videoId: string, langCode: string): string {
  const videoIdBytes = Buffer.from(videoId, "utf8");
  const langProtoUrlEncoded = buildLangProto(langCode);
  const langProtoBytes = Buffer.from(langProtoUrlEncoded, "utf8");
  const panelId = "engagement-panel-searchable-transcript-search-panel";
  const panelIdBytes = Buffer.from(panelId, "utf8");

  const proto = Buffer.concat([
    // field 1: video ID
    Buffer.from([0x0a, videoIdBytes.length]),
    videoIdBytes,
    // field 2: lang proto (URL-encoded base64 string)
    Buffer.from([0x12, langProtoBytes.length]),
    langProtoBytes,
    // field 3: int 1
    Buffer.from([0x18, 0x01]),
    // field 5: panel identifier
    Buffer.from([0x2a, panelIdBytes.length]),
    panelIdBytes,
    // field 6, 7, 8: int 1
    Buffer.from([0x30, 0x01, 0x38, 0x01, 0x40, 0x01]),
  ]);

  return proto.toString("base64");
}

// ---------------------------------------------------------------------------
// Fetch transcript via Innertube API (Android client)
// ---------------------------------------------------------------------------

async function fetchTranscriptViaApi(
  params: string,
  visitorData: string | null
): Promise<TranscriptApiResponse> {
  const url = "https://www.youtube.com/youtubei/v1/get_transcript?prettyPrint=false";

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT_ANDROID,
        "X-Youtube-Client-Name": "3",
        "X-Youtube-Client-Version": ANDROID_CLIENT_VERSION,
      },
      body: JSON.stringify({
        params,
        context: {
          client: {
            clientName: ANDROID_CLIENT_NAME,
            clientVersion: ANDROID_CLIENT_VERSION,
            androidSdkVersion: ANDROID_SDK_VERSION,
            hl: "en",
            gl: "US",
            ...(visitorData ? { visitorData } : {}),
          },
        },
      }),
    });
  } catch (err) {
    throw new TranscriptionError(
      "Network error calling YouTube transcript API",
      err
    );
  }

  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new TranscriptionError(
      `YouTube transcript API returned HTTP ${resp.status}: ${body.slice(0, 200)}`
    );
  }

  let data: unknown;
  try {
    data = await resp.json();
  } catch (err) {
    throw new TranscriptionError(
      "Failed to parse YouTube transcript API response",
      err
    );
  }

  // Check for API error
  const apiData = data as Record<string, unknown>;
  if (apiData["error"]) {
    const err = apiData["error"] as Record<string, unknown>;
    const message = String(err["message"] ?? "Unknown API error");
    const status = String(err["status"] ?? "");
    if (status === "FAILED_PRECONDITION") {
      throw new CaptionsDisabledError("(API precondition failed — captions may be unavailable)");
    }
    throw new TranscriptionError(`YouTube API error: ${message}`);
  }

  return data as TranscriptApiResponse;
}

// ---------------------------------------------------------------------------
// Parse transcript segments from API response
// ---------------------------------------------------------------------------

function parseTranscriptSegments(
  apiResponse: TranscriptApiResponse
): TranscriptSegment[] {
  const actions = apiResponse.actions ?? [];

  for (const action of actions) {
    const segments =
      action.elementsCommand?.transformEntityCommand?.arguments
        ?.transformTranscriptSegmentListArguments?.overwrite?.initialSegments;

    if (!segments || segments.length === 0) continue;

    const result: TranscriptSegment[] = [];

    for (const item of segments) {
      const renderer = item.transcriptSegmentRenderer;
      if (!renderer) continue;

      const startMs = parseInt(renderer.startMs ?? "0", 10);
      const endMs = parseInt(renderer.endMs ?? "0", 10);
      const durationMs = endMs - startMs;

      // Extract text from snippet
      let text =
        renderer.snippet?.elementsAttributedString?.content ??
        renderer.snippet?.runs?.map((r) => r.text ?? "").join("") ??
        "";

      text = text.replace(/\n/g, " ").trim();
      if (!text) continue;

      result.push({ text, startMs, durationMs });
    }

    if (result.length > 0) return result;
  }

  return [];
}

// ---------------------------------------------------------------------------
// Format conversion helpers
// ---------------------------------------------------------------------------

function msToSrtTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n: number, len = 2): string => String(n).padStart(len, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)},${pad(milliseconds, 3)}`;
}

function formatAsText(segments: TranscriptSegment[]): string {
  return segments
    .map((s) => s.text)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function formatAsSrt(segments: TranscriptSegment[]): string {
  return segments
    .map((seg, i) => {
      const start = msToSrtTimestamp(seg.startMs);
      const end = msToSrtTimestamp(seg.startMs + seg.durationMs);
      return `${i + 1}\n${start} --> ${end}\n${seg.text}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------------
// Language detection: parse transcript params to extract language
// ---------------------------------------------------------------------------

function extractLangFromParams(params: string): string {
  try {
    const decoded = Buffer.from(params, "base64");

    // field 2 starts at byte 13 (after field1 = videoId + tag/len)
    // Look for field 2 tag (0x12) and extract the URL-encoded proto
    const tagPos = decoded.indexOf(0x12, 12);
    if (tagPos === -1) return "en";

    const fieldLen = decoded[tagPos + 1];
    if (!fieldLen) return "en";

    const innerUrlEncoded = decoded.subarray(tagPos + 2, tagPos + 2 + fieldLen).toString("utf8");
    const innerBase64 = decodeURIComponent(innerUrlEncoded);
    const inner = Buffer.from(innerBase64, "base64");

    // Inner proto field 2 (0x12) = lang code
    const innerTag = inner.indexOf(0x12);
    if (innerTag === -1) return "en";
    const innerLen = inner[innerTag + 1];
    if (!innerLen) return "en";
    return inner.subarray(innerTag + 2, innerTag + 2 + innerLen).toString("utf8");
  } catch {
    return "en";
  }
}

// ---------------------------------------------------------------------------
// List available languages
// ---------------------------------------------------------------------------

export async function listAvailableLanguages(
  videoId: string
): Promise<{ code: string; name: string; isAutoGenerated: boolean }[]> {
  const pageData = await fetchPageData(videoId);

  // Check playability
  const status = pageData.playerResponse?.playabilityStatus?.status;
  if (status && status !== "OK" && status !== "LIVE_STREAM_OFFLINE") {
    throw new VideoNotFoundError(videoId);
  }

  const tracks =
    pageData.playerResponse?.captions?.playerCaptionsTracklistRenderer
      ?.captionTracks ?? [];

  return tracks.map((t) => ({
    code: t.languageCode,
    name: t.name?.simpleText ?? t.languageCode,
    isAutoGenerated: t.kind === "asr",
  }));
}

// ---------------------------------------------------------------------------
// Main transcription function
// ---------------------------------------------------------------------------

export interface TranscribeOptions {
  language?: string;
  format?: TranscriptFormat;
}

export interface TranscribeResult {
  videoId: string;
  language: string;
  isAutoGenerated: boolean;
  transcript: string | TranscriptSegment[];
}

export async function transcribeVideo(
  input: string,
  options: TranscribeOptions = {}
): Promise<TranscribeResult> {
  const { language = "en", format = "text" } = options;

  const videoId = extractVideoId(input);
  if (!videoId) {
    throw new TranscriptionError(
      `Could not extract a valid YouTube video ID from: "${input}"`
    );
  }

  console.error(`[scribe] Fetching page data for ${videoId}...`);
  const pageData = await fetchPageData(videoId);

  // Check playability from player response
  const status = pageData.playerResponse?.playabilityStatus?.status;
  if (status && status !== "OK" && status !== "LIVE_STREAM_OFFLINE") {
    const reason =
      pageData.playerResponse?.playabilityStatus?.reason ?? "unknown reason";
    throw new VideoNotFoundError(`${videoId} (${reason})`);
  }

  // Get transcript params from engagement panel
  let transcriptParams: string | null = null;

  if (pageData.initialData) {
    const existingParams = extractTranscriptParams(pageData.initialData);

    if (existingParams) {
      // Check if the existing params are for the requested language
      const existingLang = extractLangFromParams(existingParams);
      console.error(`[scribe] Found transcript params for lang=${existingLang}`);

      if (existingLang.toLowerCase() === language.toLowerCase()) {
        transcriptParams = existingParams;
      }
    }
  }

  // Build params for requested language (or use existing if language matches)
  if (!transcriptParams) {
    console.error(`[scribe] Building transcript params for lang=${language}...`);
    transcriptParams = buildTranscriptParams(videoId, language);
  }

  console.error(`[scribe] Fetching transcript via API...`);
  let apiResponse: TranscriptApiResponse;

  try {
    apiResponse = await fetchTranscriptViaApi(
      transcriptParams,
      pageData.visitorData
    );
  } catch (err) {
    if (err instanceof CaptionsDisabledError) {
      // If requested language failed, check if captions are available at all
      const tracks =
        pageData.playerResponse?.captions?.playerCaptionsTracklistRenderer
          ?.captionTracks ?? [];
      if (tracks.length > 0) {
        const available = tracks.map((t) => t.languageCode);
        throw new LanguageNotAvailableError(language, available);
      }
      throw err;
    }
    throw err;
  }

  const segments = parseTranscriptSegments(apiResponse);

  if (segments.length === 0) {
    // Captions might be available in a different language
    const tracks =
      pageData.playerResponse?.captions?.playerCaptionsTracklistRenderer
        ?.captionTracks ?? [];
    if (tracks.length > 0) {
      const available = tracks.map((t) => t.languageCode);
      throw new LanguageNotAvailableError(language, available);
    }
    throw new CaptionsDisabledError(videoId);
  }

  // Determine if captions are auto-generated by checking player response tracks
  const tracks =
    pageData.playerResponse?.captions?.playerCaptionsTracklistRenderer
      ?.captionTracks ?? [];
  const matchingTrack = tracks.find((t) =>
    t.languageCode.toLowerCase().startsWith(language.toLowerCase())
  );
  const isAutoGenerated = matchingTrack?.kind === "asr";

  let transcript: string | TranscriptSegment[];
  switch (format) {
    case "text":
      transcript = formatAsText(segments);
      break;
    case "srt":
      transcript = formatAsSrt(segments);
      break;
    case "json":
      transcript = segments;
      break;
  }

  return {
    videoId,
    language,
    isAutoGenerated,
    transcript,
  };
}
