"use client";

/**
 * Shared callout components — used in /learn and scorecard.
 * CaseStudy (green), ClientTip (amber), RiskAlert (red), InfoBox (blue).
 */

export function CaseStudy({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[#2A9D8F] bg-green-50 dark:bg-green-950/20 p-4 space-y-2">
      <p className="font-semibold text-[#2A9D8F]">{title}</p>
      {children}
    </div>
  );
}

export function ClientTip({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[#D4A843] bg-amber-50 dark:bg-amber-950/20 p-4 space-y-2">
      <p className="font-semibold text-[#D4A843]">お客様への説明ポイント</p>
      {children}
    </div>
  );
}

export function RiskAlert({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-[#E76F51] bg-red-50 dark:bg-red-950/20 p-4 space-y-2">
      <p className="font-semibold text-[#E76F51]">{title ?? "リスク要因"}</p>
      {children}
    </div>
  );
}

export function InfoBox({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border-l-4 border-l-blue-500 bg-blue-50 dark:bg-blue-950/20 p-4 space-y-2">
      <p className="font-semibold text-blue-600 dark:text-blue-400">{title ?? "参考情報"}</p>
      {children}
    </div>
  );
}

export function InterpTable({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left border-b-2 border-foreground/20 px-3 py-2 font-semibold bg-muted/30">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-foreground/10">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
