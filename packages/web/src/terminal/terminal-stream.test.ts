// @ts-nocheck
import { describe, expect, it } from "bun:test";
import type { Terminal } from "@xterm/xterm";
import {
  decodeBinaryMuxFrame,
  TerminalBinaryMessageType,
  type BinaryMuxFrame,
} from "./binary-mux";
import { TerminalStreamAdapter } from "./terminal-stream";

function createTerminalStub(): Terminal {
  return {
    write: (_text: string, callback?: () => void) => {
      callback?.();
    },
  } as unknown as Terminal;
}

function decodeFrames(frames: Uint8Array[]): BinaryMuxFrame[] {
  return frames
    .map((frame) => decodeBinaryMuxFrame(frame))
    .filter((frame): frame is BinaryMuxFrame => frame !== null);
}

function decodeInputPayload(frame: BinaryMuxFrame): string {
  return new TextDecoder().decode(frame.payload ?? new Uint8Array(0));
}

describe("TerminalStreamAdapter queued input", () => {
  it("queues while disconnected and flushes on attach confirmation", () => {
    const sentFrames: Uint8Array[] = [];
    let now = 0;
    const adapter = new TerminalStreamAdapter(createTerminalStub(), 11, (data) => {
      sentFrames.push(data);
    }, {
      now: () => now,
      inputQueue: { maxBytes: 1024, maxChunks: 10, ttlMs: 5_000 },
    });

    adapter.setInputEnabled(true);
    adapter.setTransportConnected(false);

    adapter.sendInput("first");
    adapter.sendInput("second");
    expect(sentFrames).toHaveLength(0);

    adapter.setTransportConnected(true);
    adapter.confirmAttachedStream(11);

    const decoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(decoded.map(decodeInputPayload)).toEqual(["first", "second"]);

    adapter.confirmAttachedStream(11);
    const replayDecoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(replayDecoded).toHaveLength(2);

    now += 100;
  });

  it("drops oldest chunks deterministically when chunk bound is exceeded", () => {
    const sentFrames: Uint8Array[] = [];
    const adapter = new TerminalStreamAdapter(createTerminalStub(), 21, (data) => {
      sentFrames.push(data);
    }, {
      now: () => 0,
      inputQueue: { maxBytes: 1024, maxChunks: 2, ttlMs: 5_000 },
    });

    adapter.setInputEnabled(true);
    adapter.setTransportConnected(false);

    adapter.sendInput("one");
    adapter.sendInput("two");
    adapter.sendInput("three");

    adapter.setTransportConnected(true);
    adapter.confirmAttachedStream(21);

    const decoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(decoded.map(decodeInputPayload)).toEqual(["two", "three"]);
  });

  it("drops oldest chunks deterministically when byte bound is exceeded", () => {
    const sentFrames: Uint8Array[] = [];
    const adapter = new TerminalStreamAdapter(createTerminalStub(), 31, (data) => {
      sentFrames.push(data);
    }, {
      now: () => 0,
      inputQueue: { maxBytes: 5, maxChunks: 10, ttlMs: 5_000 },
    });

    adapter.setInputEnabled(true);
    adapter.setTransportConnected(false);

    adapter.sendInput("abc");
    adapter.sendInput("de");
    adapter.sendInput("f");

    adapter.setTransportConnected(true);
    adapter.confirmAttachedStream(31);

    const decoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(decoded.map(decodeInputPayload)).toEqual(["de", "f"]);
  });

  it("expires stale queued chunks before flush", () => {
    const sentFrames: Uint8Array[] = [];
    let now = 0;
    const adapter = new TerminalStreamAdapter(createTerminalStub(), 41, (data) => {
      sentFrames.push(data);
    }, {
      now: () => now,
      inputQueue: { maxBytes: 1024, maxChunks: 10, ttlMs: 1_000 },
    });

    adapter.setInputEnabled(true);
    adapter.setTransportConnected(false);

    adapter.sendInput("stale");
    now += 1_500;
    adapter.sendInput("fresh");

    adapter.setTransportConnected(true);
    adapter.confirmAttachedStream(41);

    const decoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(decoded.map(decodeInputPayload)).toEqual(["fresh"]);
  });

  it("clears queued input when stream is invalidated while transport remains live", () => {
    const sentFrames: Uint8Array[] = [];
    const adapter = new TerminalStreamAdapter(createTerminalStub(), 51, (data) => {
      sentFrames.push(data);
    }, {
      now: () => 0,
      inputQueue: { maxBytes: 1024, maxChunks: 10, ttlMs: 5_000 },
    });

    adapter.setInputEnabled(true);
    adapter.setTransportConnected(false);
    adapter.sendInput("queued");

    adapter.setTransportConnected(true);
    adapter.resetForStreamRollover();
    adapter.confirmAttachedStream(52);

    const decoded = decodeFrames(sentFrames).filter(
      (frame) => frame.messageType === TerminalBinaryMessageType.InputUtf8,
    );
    expect(decoded).toHaveLength(0);
  });
});
