export class ScribeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class VideoNotFoundError extends ScribeError {
  constructor(videoId: string) {
    super(`Video not found or unavailable: ${videoId}`);
  }
}

export class CaptionsDisabledError extends ScribeError {
  constructor(videoId: string) {
    super(`Captions are disabled for video: ${videoId}`);
  }
}

export class LanguageNotAvailableError extends ScribeError {
  constructor(language: string, available: string[]) {
    const availableList =
      available.length > 0 ? available.join(", ") : "none";
    super(
      `Language "${language}" is not available. Available languages: ${availableList}`
    );
  }
}

export class TranscriptionError extends ScribeError {
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class ProviderNotFoundError extends ScribeError {
  constructor(input: string) {
    super(
      `No provider found for: "${input}". Use the list_providers tool to see available providers.`
    );
  }
}

export class ExtractionError extends ScribeError {
  constructor(message: string, cause?: unknown) {
    super(message);
    if (cause instanceof Error) {
      this.cause = cause;
    }
  }
}

export class ClaudeAuthError extends ScribeError {
  constructor(message: string) {
    super(message);
  }
}
