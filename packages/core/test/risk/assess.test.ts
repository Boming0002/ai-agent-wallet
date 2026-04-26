// packages/core/test/risk/assess.test.ts
import { describe, it, expect } from "vitest";
import { assessRisk } from "../../src/risk/assess.js";
import { MockProvider } from "../helpers/mock-chain.js";
import { EthersChainClient } from "../../src/chain/client.js";

const FROM = ("0x" + "ee".repeat(20)) as `0x${string}`;
const EOA  = ("0x" + "aa".repeat(20)) as `0x${string}`;
const CONTRACT = ("0x" + "bb".repeat(20)) as `0x${string}`;
const SMALL = ("0x" + "cc".repeat(20)) as `0x${string}`;

describe("assessRisk", () => {
  it("classifies EOA recipient", async () => {
    const c = new EthersChainClient(new MockProvider({}) as any);
    const r = await assessRisk(c, { to: EOA, value: "1000", data: "0x" }, FROM);
    expect(r.recipient.kind).toBe("eoa");
    expect(r.flags).not.toContain("proxy_or_minimal");
  });

  it("flags proxy_or_minimal for tiny contract", async () => {
    const c = new EthersChainClient(new MockProvider({ code: { [SMALL]: "0x6080" } }) as any);
    const r = await assessRisk(c, { to: SMALL, value: "0", data: "0x" }, FROM);
    expect(r.flags).toContain("proxy_or_minimal");
  });

  it("ERC-20 transfer call: ok when token responds to name/symbol/decimals", async () => {
    // selector for transfer(address,uint256) = 0xa9059cbb
    const data = "0xa9059cbb" + "0".repeat(64) + "0".repeat(64);
    const calls: Record<string, string> = {
      // name() = 0x06fdde03
      [CONTRACT + "0x06fdde03"]:
        "0x" + // offset
        "0".repeat(62) + "20" +
        "0".repeat(62) + "04" +
        Buffer.from("Mock", "utf8").toString("hex").padEnd(64, "0"),
      // symbol() = 0x95d89b41 — same encoding
      [CONTRACT + "0x95d89b41"]:
        "0x" +
        "0".repeat(62) + "20" +
        "0".repeat(62) + "03" +
        Buffer.from("MOK", "utf8").toString("hex").padEnd(64, "0"),
      // decimals() = 0x313ce567
      [CONTRACT + "0x313ce567"]: "0x" + "0".repeat(62) + "12", // 18
    };
    const c = new EthersChainClient(new MockProvider({
      code: { [CONTRACT]: "0x60806040" + "ab".repeat(200) },
      callResults: calls,
    }) as any);
    const r = await assessRisk(c, { to: CONTRACT, value: "0", data: data as any }, FROM);
    expect(r.recipient.kind).toBe("contract");
    expect(r.erc20?.ok).toBe(true);
  });

  it("ERC-20 sanity flags suspicious_token when calls revert", async () => {
    const data = "0xa9059cbb" + "0".repeat(64) + "0".repeat(64);
    const c = new EthersChainClient(new MockProvider({
      code: { [CONTRACT]: "0x60806040" + "ab".repeat(200) },
      callReverts: { [CONTRACT + "0x06fdde03"]: "no name" },
    }) as any);
    const r = await assessRisk(c, { to: CONTRACT, value: "0", data: data as any }, FROM);
    expect(r.flags).toContain("suspicious_token");
  });
});
