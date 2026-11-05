import { describe, expect, it } from "vitest";
import { verifyTurnstile } from "../src/turnstile";

const reply = (success: boolean) => (async () => Response.json({ success })) as unknown as typeof fetch;

describe("verifyTurnstile", () => {
  it("skips the check when no secret is configured", async () => {
    expect(await verifyTurnstile(undefined, null, null)).toBe(true);
  });
  it("rejects a missing token", async () => {
    expect(await verifyTurnstile("s", null, null, reply(true))).toBe(false);
  });
  it("follows Cloudflare's verdict", async () => {
    expect(await verifyTurnstile("s", "t", "1.2.3.4", reply(true))).toBe(true);
    expect(await verifyTurnstile("s", "t", "1.2.3.4", reply(false))).toBe(false);
  });
  it("fails closed when the verify call errors", async () => {
    const boom = (async () => { throw new Error("network"); }) as unknown as typeof fetch;
    expect(await verifyTurnstile("s", "t", null, boom)).toBe(false);
  });
});
