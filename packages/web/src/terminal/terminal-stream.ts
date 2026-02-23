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
    if (!this.inputEnabled || !this.transportConnected || this.streamId === null) return;

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

  private sendAck(ackOffset: number) {
    if (!this.inputEnabled || !this.transportConnected || this.streamId === null) return;

    const frame = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      streamId: this.streamId,
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
    // Input is intentionally not buffered across disconnects.
  }

  public setStreamId(streamId: number | null) {
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
  }

  public getOffset() {
    return this.offset;
  }

  public setOffset(offset: number) {
    this.offset = offset;
  }
}
