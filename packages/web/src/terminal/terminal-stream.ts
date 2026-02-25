import { Terminal } from "@xterm/xterm";
import {
  encodeBinaryMuxFrame,
  BinaryMuxChannel,
  TerminalBinaryMessageType,
  TerminalBinaryFlags,
  type BinaryMuxFrame
} from "./binary-mux";

type TerminalStreamChunkEvent = {
  replay: boolean;
  endOffset: number;
};

type TerminalStreamAdapterOptions = {
  onChunkApplied?: (event: TerminalStreamChunkEvent) => void;
  inputQueue?: Partial<TerminalInputQueueConfig>;
  now?: () => number;
};

type TerminalInputQueueConfig = {
  maxBytes: number;
  maxChunks: number;
  ttlMs: number;
};

type PendingInputChunk = {
  text: string;
  byteLength: number;
  enqueuedAt: number;
};

const defaultInputQueueConfig: TerminalInputQueueConfig = {
  maxBytes: 16 * 1024,
  maxChunks: 128,
  ttlMs: 15_000,
};

export class TerminalStreamAdapter {
  offset = 0;
  inputEnabled = false;
  transportConnected = false;
  decoder = new TextDecoder();
  encoder = new TextEncoder();
  terminal: Terminal;
  streamId: number | null;
  sendBinary: (data: Uint8Array) => void;
  private readonly onChunkApplied?: (event: TerminalStreamChunkEvent) => void;
  private readonly inputQueueConfig: TerminalInputQueueConfig;
  private readonly now: () => number;
  private pendingInput: PendingInputChunk[] = [];
  private pendingInputBytes = 0;

  constructor(
    terminal: Terminal,
    streamId: number,
    sendBinary: (data: Uint8Array) => void,
    options?: TerminalStreamAdapterOptions
  ) {
    this.terminal = terminal;
    this.streamId = streamId;
    this.sendBinary = sendBinary;
    this.onChunkApplied = options?.onChunkApplied;
    this.inputQueueConfig = {
      ...defaultInputQueueConfig,
      ...options?.inputQueue,
    };
    this.now = options?.now ?? (() => Date.now());
  }

  handleFrame(frame: BinaryMuxFrame) {
    if (frame.channel !== BinaryMuxChannel.Terminal) return;
    if (this.streamId === null || frame.streamId !== this.streamId) return;

    if (frame.messageType === TerminalBinaryMessageType.OutputUtf8 && frame.payload) {
      const text = this.decoder.decode(frame.payload);
      const nextOffset = frame.offset + frame.payload.byteLength;
      const replay = ((frame.flags ?? 0) & TerminalBinaryFlags.Replay) !== 0;

      this.offset = nextOffset;

      this.terminal.write(text, () => {
        this.sendAck(nextOffset);
        this.onChunkApplied?.({ replay, endOffset: nextOffset });
      });
    }
  }

  public sendInput(text: string) {
    if (!this.canSendNow()) {
      this.enqueueInput(text);
      return;
    }

    this.sendInputFrame(text);
  }

  private sendAck(ackOffset: number) {
    if (!this.canSendNow()) return;
    const streamId = this.streamId;
    if (streamId === null) {
      return;
    }

    const frame = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      streamId,
      messageType: TerminalBinaryMessageType.Ack,
      offset: ackOffset,
    });
    this.sendBinary(frame);
  }

  public setInputEnabled(enabled: boolean) {
    this.inputEnabled = enabled;
  }

  public setAttached(attached: boolean) {
    this.setInputEnabled(attached);
  }

  public setTransportConnected(connected: boolean) {
    this.transportConnected = connected;
    if (!connected) {
      this.inputEnabled = false;
    }
  }

  public clearPendingInput() {
    this.pendingInput = [];
    this.pendingInputBytes = 0;
  }

  public setStreamId(streamId: number | null) {
    if (streamId !== this.streamId && this.transportConnected) {
      this.clearPendingInput();
    }
    this.streamId = streamId;
  }

  public resetForStreamRollover(options?: { resetOffset?: boolean }) {
    this.setInputEnabled(false);
    this.setStreamId(null);
    this.clearPendingInput();
    if (options?.resetOffset) {
      this.setOffset(0);
    }
  }

  public confirmAttachedStream(streamId: number, options?: { offset?: number }) {
    this.setStreamId(streamId);
    if (typeof options?.offset === 'number') {
      this.setOffset(options.offset);
    }
    this.setInputEnabled(true);
    this.flushPendingInput();
  }

  public getOffset() {
    return this.offset;
  }

  public setOffset(offset: number) {
    this.offset = offset;
  }

  private canSendNow() {
    return this.inputEnabled && this.transportConnected && this.streamId !== null;
  }

  private sendInputFrame(text: string) {
    if (this.streamId === null) {
      return;
    }
    const payload = this.encoder.encode(text);
    const frame = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      streamId: this.streamId,
      messageType: TerminalBinaryMessageType.InputUtf8,
      offset: 0,
      payload,
    });
    this.sendBinary(frame);
  }

  private enqueueInput(text: string) {
    if (text.length === 0) {
      return;
    }

    this.dropExpiredInput();

    const byteLength = this.encoder.encode(text).byteLength;
    if (byteLength > this.inputQueueConfig.maxBytes) {
      return;
    }

    while (this.pendingInput.length >= this.inputQueueConfig.maxChunks) {
      this.dropOldestInput();
    }

    while (
      this.pendingInputBytes + byteLength > this.inputQueueConfig.maxBytes &&
      this.pendingInput.length > 0
    ) {
      this.dropOldestInput();
    }

    if (this.pendingInputBytes + byteLength > this.inputQueueConfig.maxBytes) {
      return;
    }

    this.pendingInput.push({
      text,
      byteLength,
      enqueuedAt: this.now(),
    });
    this.pendingInputBytes += byteLength;
  }

  private dropExpiredInput() {
    const expiresAt = this.now() - this.inputQueueConfig.ttlMs;
    while (this.pendingInput.length > 0) {
      const oldest = this.pendingInput[0];
      if (oldest.enqueuedAt > expiresAt) {
        break;
      }
      this.dropOldestInput();
    }
  }

  private dropOldestInput() {
    const dropped = this.pendingInput.shift();
    if (!dropped) {
      return;
    }
    this.pendingInputBytes = Math.max(0, this.pendingInputBytes - dropped.byteLength);
  }

  private flushPendingInput() {
    if (!this.canSendNow()) {
      return;
    }

    this.dropExpiredInput();

    while (this.pendingInput.length > 0 && this.canSendNow()) {
      const next = this.pendingInput.shift();
      if (!next) {
        continue;
      }
      this.pendingInputBytes = Math.max(0, this.pendingInputBytes - next.byteLength);
      this.sendInputFrame(next.text);
    }
  }
}
