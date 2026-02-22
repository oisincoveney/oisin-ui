import { Terminal } from "@xterm/xterm";
import { 
  encodeBinaryMuxFrame, 
  BinaryMuxChannel, 
  TerminalBinaryMessageType,
  type BinaryMuxFrame
} from "./binary-mux";

export class TerminalStreamAdapter {
  offset = 0;
  attached = false;
  decoder = new TextDecoder();
  encoder = new TextEncoder();
  terminal: Terminal;
  streamId: number;
  sendBinary: (data: Uint8Array) => void;

  constructor(
    terminal: Terminal,
    streamId: number,
    sendBinary: (data: Uint8Array) => void
  ) {
    this.terminal = terminal;
    this.streamId = streamId;
    this.sendBinary = sendBinary;
  }

  handleFrame(frame: BinaryMuxFrame) {
    if (frame.channel !== BinaryMuxChannel.Terminal) return;
    if (frame.streamId !== this.streamId) return;

    if (frame.messageType === TerminalBinaryMessageType.OutputUtf8 && frame.payload) {
      // Decode output chunk
      const text = this.decoder.decode(frame.payload);
      
      // Update offset and render
      this.offset = frame.offset + frame.payload.byteLength;
      
      // Write to xterm
      this.terminal.write(text, () => {
        // Send ACK back to server once rendered
        this.sendAck(this.offset);
      });
    }
  }

  public sendInput(text: string) {
    if (!this.attached) return;
    
    const payload = this.encoder.encode(text);
    const frame = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      streamId: this.streamId,
      messageType: TerminalBinaryMessageType.InputUtf8,
      offset: 0, // Input offsets not strictly tracked currently
      payload,
    });
    this.sendBinary(frame);
  }

  private sendAck(ackOffset: number) {
    if (!this.attached) return;

    const frame = encodeBinaryMuxFrame({
      channel: BinaryMuxChannel.Terminal,
      streamId: this.streamId,
      messageType: TerminalBinaryMessageType.Ack,
      offset: ackOffset,
    });
    this.sendBinary(frame);
  }

  public setAttached(attached: boolean) {
    this.attached = attached;
  }
  
  public getOffset() {
    return this.offset;
  }
  
  public setOffset(offset: number) {
    this.offset = offset;
  }
}
