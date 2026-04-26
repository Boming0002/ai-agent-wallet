import { JsonRpcProvider } from "ethers";
import type { EthAddress, Hex } from "../types.js";

export interface ChainClient {
  getBalance(addr: EthAddress): Promise<bigint>;
  getCode(addr: EthAddress): Promise<string>;
  call(tx: { to: EthAddress; data: Hex }): Promise<string>;
  estimateGas(tx: { to: EthAddress; data: Hex; value: bigint; from: EthAddress }): Promise<bigint>;
  getNonce(addr: EthAddress): Promise<number>;
  broadcastRaw(raw: Hex): Promise<{ hash: Hex }>;
  getChainId(): Promise<number>;
}

export class EthersChainClient implements ChainClient {
  private chainIdCache?: number;
  constructor(private provider: JsonRpcProvider) {}
  async getBalance(addr: EthAddress) { return await this.provider.getBalance(addr); }
  async getCode(addr: EthAddress) { return await this.provider.getCode(addr); }
  async call(tx: { to: EthAddress; data: Hex }) { return await this.provider.call(tx); }
  async estimateGas(tx: { to: EthAddress; data: Hex; value: bigint; from: EthAddress }) {
    return await this.provider.estimateGas(tx);
  }
  async getNonce(addr: EthAddress) { return await this.provider.getTransactionCount(addr); }
  async broadcastRaw(raw: Hex) {
    const r = await this.provider.broadcastTransaction(raw);
    return { hash: r.hash as Hex };
  }
  async getChainId() {
    if (this.chainIdCache !== undefined) return this.chainIdCache;
    const n = await this.provider.getNetwork();
    this.chainIdCache = Number(n.chainId);
    return this.chainIdCache;
  }
}

export function makeProvider(rpcUrl: string): JsonRpcProvider {
  return new JsonRpcProvider(rpcUrl);
}
