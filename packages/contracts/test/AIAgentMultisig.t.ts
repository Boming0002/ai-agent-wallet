// packages/contracts/test/AIAgentMultisig.t.ts
import { expect } from "chai";
import hre from "hardhat";
import { parseEther } from "viem";

describe("AIAgentMultisig", () => {
  it("constructs with 3 distinct signers and threshold 2", async () => {
    const [a, b, c] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    const sg = await m.read.getSigners();
    expect(sg.map((s: string) => s.toLowerCase())).to.deep.equal([
      a.account.address.toLowerCase(),
      b.account.address.toLowerCase(),
      c.account.address.toLowerCase(),
    ]);
    expect(await m.read.required()).to.equal(2n);
    expect(await m.read.nonce()).to.equal(0n);
  });

  it("rejects duplicate signers in constructor", async () => {
    const [a] = await hre.viem.getWalletClients();
    let threw = false;
    try {
      await hre.viem.deployContract("AIAgentMultisig", [[a.account.address, a.account.address, a.account.address]]);
    } catch { threw = true; }
    expect(threw).to.be.true;
  });

  it("executes with 2 valid signatures", async () => {
    const [a, b, c, recipient] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    const pub = await hre.viem.getPublicClient();
    // Fund the multisig.
    await a.sendTransaction({ to: m.address, value: parseEther("1") });

    const op = { to: recipient.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 0n };
    const d = await m.read.digest([op]);
    // sign by a and b (signers 0 and 1)
    const sigA = await a.signMessage({ message: { raw: d } });
    const sigB = await b.signMessage({ message: { raw: d } });

    await m.write.execute([op, [sigA, sigB]]);
    expect(await m.read.nonce()).to.equal(1n);
    const bal = await pub.getBalance({ address: recipient.account.address });
    expect(bal > parseEther("10000")).to.be.true; // hardhat default + 0.1
  });

  it("rejects with only 1 signature", async () => {
    const [a, b, c, r] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    await a.sendTransaction({ to: m.address, value: parseEther("1") });
    const op = { to: r.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 0n };
    const d = await m.read.digest([op]);
    const sigA = await a.signMessage({ message: { raw: d } });
    let threw = false;
    try { await m.write.execute([op, [sigA]]); } catch { threw = true; }
    expect(threw).to.be.true;
  });

  it("rejects on bad nonce", async () => {
    const [a, b, c, r] = await hre.viem.getWalletClients();
    const m = await hre.viem.deployContract("AIAgentMultisig", [
      [a.account.address, b.account.address, c.account.address],
    ]);
    await a.sendTransaction({ to: m.address, value: parseEther("1") });
    const op = { to: r.account.address, value: parseEther("0.1"), data: "0x" as `0x${string}`, nonce: 5n };
    const d = await m.read.digest([op]);
    const sigA = await a.signMessage({ message: { raw: d } });
    const sigB = await b.signMessage({ message: { raw: d } });
    let threw = false;
    try { await m.write.execute([op, [sigA, sigB]]); } catch { threw = true; }
    expect(threw).to.be.true;
  });
});
