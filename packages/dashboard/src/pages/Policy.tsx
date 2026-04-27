import { useEffect, useState } from "react";
import { fetchJSON } from "../api.js";
import Card from "../components/Card.js";

export default function Policy() {
  const [p, setP] = useState<any>(null);
  useEffect(() => { fetchJSON<any>("/api/policy").then(setP); }, []);
  if (!p) return <div>loading…</div>;
  return (
    <Card title="Active Policy">
      <pre className="text-xs">{JSON.stringify(p, null, 2)}</pre>
    </Card>
  );
}
