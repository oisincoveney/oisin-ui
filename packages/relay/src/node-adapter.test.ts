import { describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import { createRelayServer } from "./node-adapter.js";

async function waitForOpen(ws: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    ws.once("open", () => resolve());
    ws.once("error", reject);
  });
}

async function nextMessage(ws: WebSocket): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    ws.once("message", (data) => resolve(data.toString()));
    ws.once("error", reject);
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for condition");
}

describe("node relay adapter", () => {
  it("sends sync immediately on server control connect", async () => {
    const relay = await createRelayServer({ port: 0 });

    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=server&v=2`);
    const syncMessage = await nextMessage(ws);

    expect(JSON.parse(syncMessage)).toEqual({ type: "sync", clientIds: [] });

    ws.close();
    await relay.close();
  });

  it("treats missing version as legacy and still syncs control socket", async () => {
    const relay = await createRelayServer({ port: 0 });

    const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=server`);
    const syncMessage = await nextMessage(ws);

    expect(JSON.parse(syncMessage)).toEqual({ type: "sync", clientIds: [] });

    ws.close();
    await relay.close();
  });

  it("rejects v2 client sockets without clientId", async () => {
    const relay = await createRelayServer({ port: 0 });

    const errorMessage = await new Promise<string>((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=client&v=2`);
      ws.once("error", (error) => resolve(String(error.message)));
    });

    expect(errorMessage).toContain("400");

    await relay.close();
  });

  it("notifies control socket when a client connects", async () => {
    const relay = await createRelayServer({ port: 0 });
    const control = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=server&v=2`
    );
    const controlMessages: string[] = [];
    control.on("message", (data) => controlMessages.push(data.toString()));
    await waitForOpen(control);
    await waitFor(() => controlMessages.length >= 1);

    const client = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=client&clientId=clt_1&v=2`
    );
    await waitForOpen(client);

    await waitFor(() =>
      controlMessages.some(
        (message) =>
          message.includes('"type":"client_connected"') && message.includes('"clientId":"clt_1"')
      )
    );

    client.close();
    control.close();
    await relay.close();
  });

  it("forwards frames between v2 client and server-data sockets", async () => {
    const relay = await createRelayServer({ port: 0 });

    const control = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=server&v=2`
    );
    const controlMessages: string[] = [];
    control.on("message", (data) => controlMessages.push(data.toString()));
    await waitForOpen(control);
    await waitFor(() => controlMessages.length >= 1);

    const client = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=client&clientId=clt_2&v=2`
    );
    await waitForOpen(client);
    await waitFor(() =>
      controlMessages.some(
        (message) =>
          message.includes('"type":"client_connected"') && message.includes('"clientId":"clt_2"')
      )
    );

    const serverData = new WebSocket(
      `ws://127.0.0.1:${relay.port}/ws?serverId=srv_test&role=server&clientId=clt_2&v=2`
    );
    await waitForOpen(serverData);

    const serverReceived = new Promise<string>((resolve, reject) => {
      serverData.once("message", (data) => resolve(data.toString()));
      serverData.once("error", reject);
    });
    client.send("hello-daemon");
    await expect(serverReceived).resolves.toBe("hello-daemon");

    const clientReceived = new Promise<string>((resolve, reject) => {
      client.once("message", (data) => resolve(data.toString()));
      client.once("error", reject);
    });
    serverData.send("hello-client");
    await expect(clientReceived).resolves.toBe("hello-client");

    client.close();
    serverData.close();
    control.close();
    await relay.close();
  });

  it("supports configurable bind host for container runtime", async () => {
    const relay = await createRelayServer({ port: 0, host: "0.0.0.0" });

    const response = await fetch(`http://127.0.0.1:${relay.port}/health`);
    expect(response.ok).toBe(true);
    await expect(response.json()).resolves.toEqual({ status: "ok" });

    await relay.close();
  });
});
