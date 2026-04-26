// packages/core/src/pact/intersect.ts
import type { Policy } from "../policy/schema.js";
import type { PactPolicyOverride } from "../types.js";

function eqAddr(a: string, b: string) { return a.toLowerCase() === b.toLowerCase(); }
function minBig(a: string, b: string) { return BigInt(a) < BigInt(b) ? a : b; }

export function intersectPolicy(global: Policy, override: PactPolicyOverride): Policy {
  return {
    ...global,
    perTxMaxWei: override.perTxMaxWei ? minBig(global.perTxMaxWei, override.perTxMaxWei) : global.perTxMaxWei,
    autoApproveMaxWei: override.autoApproveMaxWei
      ? minBig(global.autoApproveMaxWei, override.autoApproveMaxWei) : global.autoApproveMaxWei,
    addressAllowlist:
      global.addressAllowlist.length === 0 && override.addressAllowlist
        ? override.addressAllowlist
        : (override.addressAllowlist
            ? global.addressAllowlist.filter((a) => override.addressAllowlist!.some((b) => eqAddr(a, b)))
            : global.addressAllowlist),
    addressDenylist: Array.from(new Set([
      ...global.addressDenylist,
      ...(override.addressDenylist ?? []),
    ])),
    contractMethodAllowlist: override.contractMethodAllowlist
      ? [...global.contractMethodAllowlist, ...override.contractMethodAllowlist]
      : global.contractMethodAllowlist,
  };
}
