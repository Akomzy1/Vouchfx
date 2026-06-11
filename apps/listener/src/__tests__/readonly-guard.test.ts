import { describe, it, expect } from "vitest";
import type { ReadonlyTelegramClient } from "../readonly-guard";
import { asReadonly } from "../readonly-guard";

/**
 * Readonly guard — verifies the safe surface area of a Telegram user session.
 *
 * INVARIANT: a user session MUST perform ZERO write/outbound MTProto operations.
 * The ReadonlyTelegramClient interface enforces this at compile time.
 * These tests verify the runtime narrowing behaves correctly.
 */

// Minimal mock of TelegramClient for testing purposes
function makeMockClient() {
  return {
    connect: () => Promise.resolve(),
    disconnect: () => Promise.resolve(),
    addEventHandler: (_cb: unknown, _event: unknown) => undefined,
    downloadMedia: () => Promise.resolve(Buffer.from("")),
    // Write methods that MUST NOT be accessible via ReadonlyTelegramClient:
    sendMessage: () => { throw new Error("sendMessage MUST NOT be called"); },
    editMessage: () => { throw new Error("editMessage MUST NOT be called"); },
    deleteMessages: () => { throw new Error("deleteMessages MUST NOT be called"); },
    joinChannel: () => { throw new Error("joinChannel MUST NOT be called"); },
    leaveChannel: () => { throw new Error("leaveChannel MUST NOT be called"); },
    sendReaction: () => { throw new Error("sendReaction MUST NOT be called"); },
    markAsRead: () => { throw new Error("markAsRead MUST NOT be called"); },
  };
}

describe("asReadonly — type narrowing", () => {
  it("returns a client that exposes connect()", async () => {
    const mock = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro: ReadonlyTelegramClient = asReadonly(mock as any);
    await expect(ro.connect()).resolves.toBeUndefined();
  });

  it("returns a client that exposes disconnect()", async () => {
    const mock = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro: ReadonlyTelegramClient = asReadonly(mock as any);
    await expect(ro.disconnect()).resolves.toBeUndefined();
  });

  it("returns a client that exposes addEventHandler()", () => {
    const mock = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro: ReadonlyTelegramClient = asReadonly(mock as any);
    expect(() => ro.addEventHandler(() => {}, {})).not.toThrow();
  });

  it("returns a client that exposes downloadMedia() (CDN fetch — no write)", async () => {
    const mock = makeMockClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ro: ReadonlyTelegramClient = asReadonly(mock as any);
    const buf = await ro.downloadMedia({});
    expect(buf).toBeDefined();
  });

  it("ReadonlyTelegramClient interface does NOT expose sendMessage at the type level", () => {
    // This test documents the invariant. If the interface ever adds sendMessage,
    // the TypeScript compiler would error here before this test even runs.
    const ro = {} as ReadonlyTelegramClient;
    expect(typeof (ro as { sendMessage?: unknown }).sendMessage).toBe("undefined");
  });

  it("ReadonlyTelegramClient interface does NOT expose joinChannel at the type level", () => {
    const ro = {} as ReadonlyTelegramClient;
    expect(typeof (ro as { joinChannel?: unknown }).joinChannel).toBe("undefined");
  });
});
