import { describe, it, expect } from "vitest";
import { EthersChainClient } from "../../src/chain/client.js";
import { MockProvider } from "../helpers/mock-chain.js";

describe("EthersChainClient", () => {
  it("getBalance returns wei as bigint", async () => {
    const provider = new MockProvider({ balances: { ["0x" + "aa".repeat(20)]: 12345n } });
    const c = new EthersChainClient(provider as any);
    const b = await c.getBalance("0x" + "aa".repeat(20) as any);
    expect(b).toBe(12345n);
  });

  it("getCode returns 0x for EOA", async () => {
    const provider = new MockProvider({ code: { ["0x" + "aa".repeat(20)]: "0x" } });
    const c = new EthersChainClient(provider as any);
    expect(await c.getCode("0x" + "aa".repeat(20) as any)).toBe("0x");
  });

  it("getCode returns bytecode for contract", async () => {
    const provider = new MockProvider({ code: { ["0x" + "bb".repeat(20)]: "0x60806040" } });
    const c = new EthersChainClient(provider as any);
    expect(await c.getCode("0x" + "bb".repeat(20) as any)).toBe("0x60806040");
  });
});
