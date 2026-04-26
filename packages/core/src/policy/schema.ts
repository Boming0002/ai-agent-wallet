// packages/core/src/policy/schema.ts
import { z } from "zod";

const Decimal = z.string().regex(/^\d+$/, "must be decimal wei string");
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/);

export const PolicySchema = z
  .object({
    version: z.literal(1),
    perTxMaxWei: Decimal,
    dailyMaxWei: Decimal,
    autoApproveMaxWei: Decimal,
    addressAllowlist: z.array(Address).default([]),
    addressDenylist: z.array(Address).default([]),
    contractMethodAllowlist: z
      .array(z.object({ address: Address, selector: Selector }))
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (BigInt(p.autoApproveMaxWei) > BigInt(p.perTxMaxWei)) {
      ctx.addIssue({ code: "custom", message: "autoApproveMaxWei must be <= perTxMaxWei" });
    }
  });

export type Policy = z.infer<typeof PolicySchema>;

export function defaultPolicy(): Policy {
  return {
    version: 1,
    perTxMaxWei: "200000000000000000",      // 0.2 ETH
    dailyMaxWei: "500000000000000000",      // 0.5 ETH
    autoApproveMaxWei: "10000000000000000", // 0.01 ETH
    addressAllowlist: [],
    addressDenylist: [],
    contractMethodAllowlist: [],
  };
}
