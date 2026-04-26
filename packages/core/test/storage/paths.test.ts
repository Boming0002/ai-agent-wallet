import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveDataDir } from "../../src/storage/paths.js";
import os from "node:os";
import path from "node:path";

describe("resolveDataDir", () => {
  const ORIGINAL = process.env.AI_WALLET_DATA_DIR;
  beforeEach(() => { delete process.env.AI_WALLET_DATA_DIR; });
  afterEach(() => {
    if (ORIGINAL) process.env.AI_WALLET_DATA_DIR = ORIGINAL;
    else delete process.env.AI_WALLET_DATA_DIR;
  });

  it("uses explicit override", () => {
    expect(resolveDataDir("/tmp/x")).toBe("/tmp/x");
  });
  it("uses env var when no override", () => {
    process.env.AI_WALLET_DATA_DIR = "/tmp/env";
    expect(resolveDataDir()).toBe("/tmp/env");
  });
  it("defaults to ~/.ai-agent-wallet", () => {
    expect(resolveDataDir()).toBe(path.join(os.homedir(), ".ai-agent-wallet"));
  });
});
