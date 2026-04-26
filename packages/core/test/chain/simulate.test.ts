import { describe, it, expect } from "vitest";
import { simulate } from "../../src/chain/simulate.js";
import { MockProvider } from "../helpers/mock-chain.js";
import { EthersChainClient } from "../../src/chain/client.js";

describe("simulate", () => {
  it("returns ok with gas when call succeeds", async () => {
    const c = new EthersChainClient(new MockProvider({}) as any);
    const r = await simulate(c, {
      to: "0x" + "aa".repeat(20) as any, data: "0x" as any, value: "0",
    }, "0x" + "bb".repeat(20) as any);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.gasUsed).toBe("21000");
  });

  it("decodes revert reason from Error(string)", async () => {
    const provider = new MockProvider({
      callReverts: { ["0x" + "aa".repeat(20) + "0x"]: "boom" },
    });
    const c = new EthersChainClient(provider as any);
    const r = await simulate(c, {
      to: "0x" + "aa".repeat(20) as any, data: "0x" as any, value: "0",
    }, "0x" + "bb".repeat(20) as any);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.revertReason).toMatch(/boom|execution reverted/);
  });
});
