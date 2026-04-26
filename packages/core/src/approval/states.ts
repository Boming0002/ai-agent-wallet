// packages/core/src/approval/states.ts
import type { PendingStatus } from "../types.js";

export const ALLOWED: Record<PendingStatus, PendingStatus[]> = {
  pending: ["approved", "rejected", "expired", "broadcast"],
  approved: ["broadcast"],
  rejected: [],
  expired: [],
  broadcast: [],
};

export function canTransition(from: PendingStatus, to: PendingStatus): boolean {
  return ALLOWED[from]?.includes(to) ?? false;
}
