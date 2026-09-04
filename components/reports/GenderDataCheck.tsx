"use client";

import { Card, CardContent } from "@/components/ui/card";
import type { EmployeeRecord } from "@/lib/employee-service";

type FilterResult = { filter: string; result: string; rows: EmployeeRecord[]; databaseRows?: EmployeeRecord[] };

export function FilterDataCheck({ results }: { results: FilterResult[] }) {
  return <Card className="w-fit max-w-full overflow-auto"><CardContent className="pt-4"><h3 className="mb-2 text-sm font-semibold">Filter Data Check</h3><table className="w-auto border-collapse text-xs"><thead><tr className="bg-muted"><th className="border px-3 py-1 text-left">Filter</th><th className="border px-3 py-1 text-left">Result</th><th className="border px-3 py-1">Database</th><th className="border px-3 py-1">Summary</th><th className="border px-3 py-1">Status</th></tr></thead><tbody>{results.map((item, index) => { const databaseTotal = item.databaseRows?.length ?? item.rows.length; const resumeTotal = item.rows.length; const status = databaseTotal === resumeTotal ? "MATCH" : "MISMATCH"; return <tr key={`${item.filter}-${index}`}><td className="border px-3 py-1 font-medium">{item.filter}</td><td className="border px-3 py-1">{item.result}</td><td className="border px-3 py-1 text-center">{databaseTotal}</td><td className="border px-3 py-1 text-center">{resumeTotal}</td><td className={`border px-3 py-1 text-center font-semibold ${status === "MATCH" ? "text-green-600" : "text-red-600"}`}>{status}</td></tr>; })}</tbody></table><p className="mt-2 text-[11px] text-muted-foreground">Database = raw data matching the filter; Summary = results after the date period is applied.</p></CardContent></Card>;
}
