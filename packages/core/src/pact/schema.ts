// packages/core/src/pact/schema.ts
import { z } from "zod";

const Decimal = z.string().regex(/^\d+$/);
const Address = z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const Selector = z.string().regex(/^0x[0-9a-fA-F]{8}$/);

export const PactPolicyOverrideSchema = z.object({
  perTxMaxWei: Decimal.optional(),
  autoApproveMaxWei: Decimal.optional(),
  addressAllowlist: z.array(Address).optional(),
  addressDenylist: z.array(Address).optional(),
  contractMethodAllowlist: z.array(z.object({ address: Address, selector: Selector })).optional(),
});

export const PactCreateInputSchema = z.object({
  name: z.string().min(1).max(128),
  intent: z.string().min(1).max(2048),
  policyOverride: PactPolicyOverrideSchema.default({}),
  expiresAtMs: z.number().int().positive(),
  maxTotalValueWei: Decimal,
  maxOpCount: z.number().int().positive().optional(),
});

export type PactCreateInput = z.infer<typeof PactCreateInputSchema>;
