import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";
import Table from "../components/Table.js";

interface AuditResp { entries: any[]; headHash: string; verification: any }

export default function Audit() {
  const [d, setD] = useState<AuditResp | null>(null);
  useEffect(() => { fetchJSON<AuditResp>("/api/audit?verify=1").then(setD); }, []);
  if (!d) return <div>loading…</div>;
  const ok = d.verification?.ok;
  return (
    <>
      <Card title="Chain Integrity">
        <span className={ok ? "text-green-700" : "text-red-700"}>
          {ok ? "verified" : `broken at seq ${d.verification?.brokenAt}`}
        </span>
        <div className="mt-1 font-mono text-xs break-all">{d.headHash}</div>
      </Card>
      <Card title="Entries">
        <Table
          headers={["#", "Time", "Kind", "Payload"]}
          rows={d.entries.map((e: any) => [
            e.seq,
            new Date(e.ts).toISOString(),
            e.kind,
            <code key="p" className="text-xs">{JSON.stringify(e.payload)}</code>,
          ])}
        />
      </Card>
    </>
  );
}
