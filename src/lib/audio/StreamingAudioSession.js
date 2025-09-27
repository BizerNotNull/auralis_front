const DEFAULT_MIME_TYPE = "audio/mpeg";

function isMediaSourceAvailable() {
  if (typeof window === "undefined") {
    return false;
  }
  const { MediaSource } = window;
  if (!MediaSource || typeof MediaSource.isTypeSupported !== "function") {
    return false;
  }
  return true;
}

function selectMimeType(preferred) {
  if (!isMediaSourceAvailable()) {
    return null;
  }
  const { MediaSource } = window;
  const candidates = [];
  if (preferred && typeof preferred === "string") {
    candidates.push(preferred.trim().toLowerCase());
  }
  candidates.push(DEFAULT_MIME_TYPE);
  for (const candidate of candidates) {
    if (candidate && MediaSource.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function cloneArrayBuffer(view) {
  if (!view || !(view instanceof Uint8Array)) {
    return null;
  }
  const start = view.byteOffset;
  const end = view.byteOffset + view.byteLength;
  return view.buffer.slice(start, end);
}

export default class StreamingAudioSession {
  constructor(options = {}) {
    const {
      mimeType,
      onFirstPlayable,
      onError,
      onEnded,
      debugLabel = "",
      debug = false,
    } = options;

    this.debug = Boolean(debug);
    const normalizedLabel =
      typeof debugLabel === "string"
        ? debugLabel
        : debugLabel == null
          ? ""
          : String(debugLabel);
    this.debugLabel = normalizedLabel.trim();
    this.debugLog = (message, ...args) => {
      if (!this.debug || typeof console === "undefined") {
        return;
      }
      const prefix = this.debugLabel
        ? `[StreamingAudioSession:${this.debugLabel}]`
        : "[StreamingAudioSession]";
      const logger = typeof console.debug === "function" ? console.debug : console.log;
      try {
        logger.call(console, prefix, message, ...args);
      } catch {
        // ignore logging failures
      }
    };

    this.onFirstPlayable = typeof onFirstPlayable === "function" ? onFirstPlayable : null;
    this.onError = typeof onError === "function" ? onError : null;
    this.onEnded = typeof onEnded === "function" ? onEnded : null;
    this.mediaSource = null;
    this.sourceBuffer = null;
    this.objectUrl = null;
    this.audioElement = null;
    this.queue = [];
    this.finalized = false;
    this.playableNotified = false;
    this.destroyed = false;
    this.pendingFlush = false;
    this.lastSequence = -1;
    this.streamingSupported = false;
    this.supportedMimeType = null;
    this.receivedChunkCount = 0;

    if (typeof window !== "undefined") {
      this.supportedMimeType = selectMimeType(mimeType);
      this.streamingSupported = Boolean(this.supportedMimeType);
    }

    this.debugLog("constructor", {
      requestedMimeType: mimeType,
      resolvedMimeType: this.supportedMimeType,
      streamingSupported: this.streamingSupported,
    });

    if (this.streamingSupported) {
      this.mediaSource = new MediaSource();
      this.handleSourceOpen = this.handleSourceOpen.bind(this);
      this.handleSourceEnded = this.handleSourceEnded.bind(this);
      this.mediaSource.addEventListener("sourceopen", this.handleSourceOpen);
      this.mediaSource.addEventListener("sourceended", this.handleSourceEnded);
      this.objectUrl = URL.createObjectURL(this.mediaSource);
      this.debugLog("created MediaSource");
    } else {
      this.debugLog("streaming unsupported; will fall back to buffered audio");
    }
  }

  handleSourceOpen() {
    if (this.destroyed || !this.mediaSource || this.mediaSource.readyState !== "open") {
      return;
    }
    try {
      this.sourceBuffer = this.mediaSource.addSourceBuffer(this.supportedMimeType);
      this.sourceBuffer.mode = "sequence";
      this.sourceBuffer.addEventListener("updateend", () => {
        this.flushQueue();
        this.checkFirstPlayable();
        if (this.finalized && this.queue.length === 0 && !this.sourceBuffer.updating) {
          this.endStreamSafely();
        }
      });
      this.sourceBuffer.addEventListener("error", (event) => {
        this.debugLog("source buffer error", event);
        if (typeof this.onError === "function") {
          this.onError(event);
        }
      });
      this.debugLog("source buffer initialised");
      this.flushQueue();
    } catch (error) {
      this.debugLog("handleSourceOpen failure", error);
      if (typeof this.onError === "function") {
        this.onError(error);
      }
    }
  }

  handleSourceEnded() {
    this.debugLog("source ended");
    if (typeof this.onEnded === "function") {
      this.onEnded();
    }
  }

  appendChunk(bytes, sequence) {
    if (this.destroyed) {
      return;
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      return;
    }
    if (typeof sequence === "number" && sequence >= 0) {
      if (sequence <= this.lastSequence) {
        return;
      }
      this.lastSequence = sequence;
    }
    if (!this.streamingSupported) {
      if (!this.fallbackBuffers) {
        this.fallbackBuffers = [];
      }
      this.fallbackBuffers.push(bytes);
      this.debugLog("buffered chunk for fallback", {
        sequence,
        size: bytes.length,
        totalChunks: this.fallbackBuffers.length,
      });
      return;
    }
    const buffer = cloneArrayBuffer(bytes);
    if (!buffer) {
      return;
    }
    this.queue.push(buffer);
    this.receivedChunkCount += 1;
    if (this.receivedChunkCount === 1) {
      this.debugLog("received first streaming chunk", { size: bytes.length, sequence });
    } else if (this.receivedChunkCount % 20 === 0) {
      this.debugLog("received streaming chunk batch", {
        count: this.receivedChunkCount,
        latestSequence: sequence,
      });
    }
    this.flushQueue();
  }

  flushQueue() {
    if (!this.streamingSupported || this.destroyed) {
      return;
    }
    if (!this.sourceBuffer || this.sourceBuffer.updating) {
      return;
    }
    const next = this.queue.shift();
    if (!next) {
      if (this.finalized) {
        this.endStreamSafely();
      }
      return;
    }
    try {
      this.sourceBuffer.appendBuffer(next);
      this.debugLog("appended chunk to source buffer", {
        remainingQueue: this.queue.length,
        finalized: this.finalized,
      });
    } catch (error) {
      this.debugLog("appendBuffer failed", error);
      if (typeof this.onError === "function") {
        this.onError(error);
      }
    }
  }

  checkFirstPlayable() {
    if (this.playableNotified || !this.streamingSupported || !this.sourceBuffer) {
      return;
    }
    const buffered = this.sourceBuffer.buffered;
    if (!buffered || buffered.length === 0) {
      return;
    }
    const duration = buffered.end(buffered.length - 1) - buffered.start(0);
    if (duration <= 0) {
      return;
    }
    this.playableNotified = true;
    this.debugLog("buffer ready for playback", { duration });
    if (typeof this.onFirstPlayable === "function") {
      try {
        this.onFirstPlayable();
      } catch (error) {
        this.debugLog("onFirstPlayable threw", error);
        if (typeof this.onError === "function") {
          this.onError(error);
        }
      }
    }
  }

  finalize() {
    if (this.destroyed) {
      return;
    }
    this.finalized = true;
    this.debugLog("finalize requested", {
      queueLength: this.queue.length,
      streamingSupported: this.streamingSupported,
    });
    if (this.streamingSupported) {
      if (this.sourceBuffer && !this.sourceBuffer.updating) {
        this.endStreamSafely();
      }
    }
  }

  endStreamSafely() {
    if (!this.streamingSupported || !this.mediaSource) {
      return;
    }
    if (this.mediaSource.readyState === "open") {
      try {
        this.mediaSource.endOfStream();
        this.debugLog("media source marked endOfStream");
      } catch (error) {
        this.debugLog("endOfStream failed", error);
        if (typeof this.onError === "function") {
          this.onError(error);
        }
      }
    }
  }

  getAudioElement() {
    if (this.destroyed) {
      return null;
    }
    if (this.audioElement) {
      return this.audioElement;
    }
    const element = typeof Audio === "function" ? new Audio() : null;
    if (!element) {
      return null;
    }
    element.preload = "auto";
    element.crossOrigin = "anonymous";
    if (this.streamingSupported) {
      if (!this.objectUrl && this.mediaSource) {
        this.objectUrl = URL.createObjectURL(this.mediaSource);
      }
      if (!this.objectUrl) {
        return null;
      }
      element.src = this.objectUrl;
      element.load();
      this.debugLog("attached media source to audio element", { objectUrl: this.objectUrl });
    } else if (this.fallbackBuffers && this.fallbackBuffers.length > 0) {
      const combined = new Uint8Array(
        this.fallbackBuffers.reduce((acc, chunk) => acc + chunk.length, 0),
      );
      let offset = 0;
      for (const chunk of this.fallbackBuffers) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      const blob = new Blob([combined.buffer], {
        type: this.supportedMimeType || DEFAULT_MIME_TYPE,
      });
      this.objectUrl = URL.createObjectURL(blob);
      element.src = this.objectUrl;
      element.load();
      this.debugLog("using fallback buffered audio", {
        chunks: this.fallbackBuffers.length,
        objectUrl: this.objectUrl,
      });
    } else {
      return null;
    }
    this.audioElement = element;
    return element;
  }

  isPlayable() {
    if (this.destroyed) {
      return false;
    }
    if (this.streamingSupported) {
      return this.playableNotified;
    }
    return false;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.debugLog("destroy called");
    this.destroyed = true;
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch (error) {
        this.debugLog("pause during destroy failed", error);
      }
      this.audioElement.src = "";
      this.audioElement.load();
      this.audioElement = null;
    }
    if (this.mediaSource) {
      try {
        const { readyState } = this.mediaSource;
        if (readyState === "open") {
          this.mediaSource.endOfStream();
        }
      } catch (error) {
        this.debugLog("mediaSource endOfStream during destroy failed", error);
      }
      this.mediaSource.removeEventListener("sourceopen", this.handleSourceOpen);
      this.mediaSource.removeEventListener("sourceended", this.handleSourceEnded);
    }
    if (this.objectUrl) {
      try {
        URL.revokeObjectURL(this.objectUrl);
      } catch (error) {
        this.debugLog("revokeObjectURL failed", error);
      }
    }
    this.queue = [];
    this.sourceBuffer = null;
    this.mediaSource = null;
    this.objectUrl = null;
  }
}
