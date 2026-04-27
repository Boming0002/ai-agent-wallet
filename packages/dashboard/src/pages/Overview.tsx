import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";

interface OverviewData {
  initialized: boolean;
  address?: string; chainId?: number; balance?: string;
  pendingCount?: number; headHash?: string;
  policy?: any;
}

function ethFromWei(s: string): string {
  const w = BigInt(s);
  const whole = w / 10n ** 18n;
  const frac = w % 10n ** 18n;
  if (frac === 0n) return `${whole} ETH`;
  return `${whole}.${frac.toString().padStart(18, "0").replace(/0+$/, "")} ETH`;
}

export default function Overview() {
  const [d, setD] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    fetchJSON<OverviewData>("/api/overview").then(setD).catch((e) => setErr(e.message));
  }, []);
  if (err) return <div className="text-red-600">error: {err}</div>;
  if (!d) return <div>loading…</div>;
  if (!d.initialized) return <div>No wallet found. Run <code>aiwallet init</code>.</div>;
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <Card title="Address">
        <div className="font-mono text-sm">{d.address}</div>
        <div className="text-xs text-slate-500">chainId {d.chainId}</div>
      </Card>
      <Card title="Balance"><div className="text-2xl">{ethFromWei(d.balance ?? "0")}</div></Card>
      <Card title="Pending Operations"><div className="text-2xl">{d.pendingCount}</div></Card>
      <Card title="Audit Chain Head"><div className="font-mono text-xs break-all">{d.headHash}</div></Card>
      <Card title="Policy">
        <pre className="text-xs">{JSON.stringify(d.policy, null, 2)}</pre>
      </Card>
    </div>
  );
}
