import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";
import Table from "../components/Table.js";

export default function Pending() {
  const [ops, setOps] = useState<any[] | null>(null);
  useEffect(() => { fetchJSON<any[]>("/api/pending").then(setOps); }, []);
  if (!ops) return <div>loading…</div>;
  return (
    <Card title="Pending Operations">
      <Table
        headers={["ID", "Status", "To", "Value (wei)", "TTL", "Reason"]}
        rows={ops.map((o) => [
          <code key="i" className="text-xs">{o.id}</code>,
          o.status,
          <code key="t" className="text-xs">{o.tx.to}</code>,
          o.tx.value,
          o.status === "pending" ? `${Math.max(0, Math.round((o.expiresAt - Date.now()) / 1000))}s` : "—",
          o.policyVerdict.reason,
        ])}
      />
    </Card>
  );
}
