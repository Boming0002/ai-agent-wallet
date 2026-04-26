export interface MockState {
  balances?: Record<string, bigint>;
  code?: Record<string, string>;
  callResults?: Record<string, string>;            // keccak(to+data) → return-data hex
  callReverts?: Record<string, string>;            // keccak(to+data) → revert reason
  nonces?: Record<string, number>;
  txHashes?: string[];                              // pop next on send
}

export class MockProvider {
  constructor(private state: MockState) {}
  async getBalance(addr: string): Promise<bigint> {
    return this.state.balances?.[addr.toLowerCase()] ?? this.state.balances?.[addr] ?? 0n;
  }
  async getCode(addr: string): Promise<string> {
    return this.state.code?.[addr.toLowerCase()] ?? this.state.code?.[addr] ?? "0x";
  }
  async call(tx: { to: string; data: string }): Promise<string> {
    const k = (tx.to + tx.data).toLowerCase();
    if (this.state.callReverts?.[k]) {
      const e: any = new Error("execution reverted");
      e.data = "0x08c379a0" + Buffer.from(this.state.callReverts[k]).toString("hex");
      throw e;
    }
    return this.state.callResults?.[k] ?? "0x";
  }
  async estimateGas(): Promise<bigint> { return 21000n; }
  async getTransactionCount(addr: string): Promise<number> {
    return this.state.nonces?.[addr.toLowerCase()] ?? 0;
  }
  async broadcastTransaction(_raw: string): Promise<{ hash: string }> {
    const h = this.state.txHashes?.shift() ?? "0x" + "ab".repeat(32);
    return { hash: h };
  }
}
