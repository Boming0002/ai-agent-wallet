import { Link, Route, Routes, useLocation } from "react-router-dom";
import Overview from "./pages/Overview.js";
import Pending from "./pages/Pending.js";
import Audit from "./pages/Audit.js";
import Policy from "./pages/Policy.js";

function Nav() {
  const loc = useLocation();
  const tabs = [
    ["/", "Overview"], ["/pending", "Pending"], ["/audit", "Audit"], ["/policy", "Policy"],
  ] as const;
  return (
    <nav className="flex gap-2 border-b border-slate-200 bg-white px-6 py-3">
      <h1 className="mr-6 text-lg font-semibold text-slate-900">AI Agent Wallet</h1>
      {tabs.map(([href, label]) => (
        <Link key={href} to={href}
          className={`rounded px-3 py-1 text-sm ${loc.pathname === href ? "bg-slate-900 text-white" : "text-slate-700 hover:bg-slate-100"}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

export default function App() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="px-6 py-6">
        <Routes>
          <Route path="/" element={<Overview />} />
          <Route path="/pending" element={<Pending />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/policy" element={<Policy />} />
        </Routes>
      </main>
    </div>
  );
}
