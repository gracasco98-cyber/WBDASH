import { describe, it, expect, vi, beforeEach } from "vitest";

function fakeResponse() {
  const listeners: Record<string, () => void> = {};
  return {
    write: vi.fn(),
    on: vi.fn((event: string, cb: () => void) => { listeners[event] = cb; }),
    triggerClose: () => listeners.close?.(),
  };
}

describe("sse", () => {
  beforeEach(() => { vi.resetModules(); });

  it("broadcast sends the event to every connected client", async () => {
    const { addSSEClient, broadcast } = await import("../../src/sse/sse");
    const a = fakeResponse();
    const b = fakeResponse();
    addSSEClient(a as any);
    addSSEClient(b as any);

    broadcast("order:new", { id: 1 });

    expect(a.write).toHaveBeenCalledWith(expect.stringContaining("event: order:new"));
    expect(b.write).toHaveBeenCalledWith(expect.stringContaining("event: order:new"));
  });

  it("broadcastToUser sends only to clients registered with that userId", async () => {
    const { addSSEClient, broadcastToUser } = await import("../../src/sse/sse");
    const aliceClient = fakeResponse();
    const bobClient = fakeResponse();
    addSSEClient(aliceClient as any, "alice");
    addSSEClient(bobClient as any, "bob");

    broadcastToUser("alice", "task:assigned", { taskId: "t1" });

    expect(aliceClient.write).toHaveBeenCalledWith(expect.stringContaining("event: task:assigned"));
    expect(bobClient.write).not.toHaveBeenCalled();
  });

  it("broadcastToUser does nothing for a userId with no connected client", async () => {
    const { addSSEClient, broadcastToUser } = await import("../../src/sse/sse");
    const aliceClient = fakeResponse();
    addSSEClient(aliceClient as any, "alice");

    expect(() => broadcastToUser("carol", "task:assigned", {})).not.toThrow();
    expect(aliceClient.write).not.toHaveBeenCalled();
  });

  it("a client with no userId (anonymous) never receives broadcastToUser events", async () => {
    const { addSSEClient, broadcastToUser } = await import("../../src/sse/sse");
    const anon = fakeResponse();
    addSSEClient(anon as any);

    broadcastToUser("alice", "task:assigned", {});

    expect(anon.write).not.toHaveBeenCalled();
  });

  it("removes a client on close so later broadcasts skip it", async () => {
    const { addSSEClient, broadcast, sseClientCount } = await import("../../src/sse/sse");
    const a = fakeResponse();
    addSSEClient(a as any);
    expect(sseClientCount()).toBe(1);

    a.triggerClose();
    expect(sseClientCount()).toBe(0);

    broadcast("order:new", {});
    expect(a.write).not.toHaveBeenCalled();
  });
});
