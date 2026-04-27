import type { ReactNode } from "react";
export default function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <table className="w-full text-left text-sm">
      <thead className="border-b border-slate-200 text-slate-500">
        <tr>{headers.map((h) => <th key={h} className="py-2 pr-4 font-medium">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-b border-slate-100">
            {row.map((cell, j) => <td key={j} className="py-2 pr-4 align-top">{cell}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
