"use client";

import { useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, Play, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { EmployeeRecord } from "@/lib/employee-service";

type ReportKey = "demografi" | "kontrak" | "baru" | "keluar" | "jamKerja" | "cuti" | "kompensasi" | "pensiun" | "payroll" | "sp";

const reports: { key: ReportKey; label: string; available: boolean }[] = [
  { key: "demografi", label: "Demografi", available: true },
  { key: "kontrak", label: "Kontrak", available: true },
  { key: "baru", label: "Karyawan Baru", available: true },
  { key: "keluar", label: "Karyawan Keluar", available: true },
  { key: "jamKerja", label: "Jam Kerja & Lembur", available: true },
  { key: "cuti", label: "Cuti", available: false },
  { key: "kompensasi", label: "Kompensasi Kontrak", available: false },
  { key: "pensiun", label: "Pensiun", available: false },
  { key: "payroll", label: "Payroll & Benefit", available: false },
  { key: "sp", label: "Surat Peringatan", available: false },
];

const value = (employee: EmployeeRecord, key: string) => String(employee[key] ?? "").trim();
const date = (employee: EmployeeRecord, key: string) => value(employee, key).slice(0, 10);
const formatDate = (raw: string) => raw ? new Date(`${raw}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "short", year: "numeric" }) : "—";
const status = (employee: EmployeeRecord) => value(employee, "status").toLowerCase();
const age = (employee: EmployeeRecord) => value(employee, "age") || "—";
const workPosition = (employee: EmployeeRecord) => value(employee, "type") || "Belum diatur";

function isWithinPeriod(employee: EmployeeRecord, from: string, to: string, field: "joinDate" | "exitDate") {
  const selectedDate = date(employee, field);
  if (!from && !to) return true;
  return Boolean(selectedDate) && (!from || selectedDate >= from) && (!to || selectedDate <= to);
}

function CompactTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return <div className="w-fit max-w-full overflow-auto"><table className="border-collapse text-xs"><thead><tr className="bg-muted">{headers.map((header) => <th className="whitespace-nowrap border px-3 py-2 text-left font-semibold" key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function EmptyReport({ title }: { title: string }) {
  return <Card><CardContent className="py-8 text-sm text-muted-foreground"><p className="font-medium text-foreground">{title}</p><p className="mt-1">Tampilan report sudah disiapkan. Data sumber belum tersedia di database, sehingga report ini dapat diaktifkan setelah modul datanya dibuat.</p></CardContent></Card>;
}

export function HrReportCenter() {
  const [employees, setEmployees] = useState<EmployeeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [employeeStatus, setEmployeeStatus] = useState("all");
  const [department, setDepartment] = useState("all");
  const [hasRun, setHasRun] = useState(false);

  useEffect(() => { fetch("/api/employees", { cache: "no-store" }).then((response) => response.json()).then((data) => setEmployees(data.employees ?? [])).catch(() => setEmployees([])).finally(() => setLoading(false)); }, []);

  const departments = useMemo(() => Array.from(new Set(employees.map((employee) => value(employee, "department")).filter(Boolean))).sort(), [employees]);
  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const employeeStatusValue = status(employee);
    return (employeeStatus === "all" || employeeStatusValue === employeeStatus) && (department === "all" || value(employee, "department") === department);
  }), [department, employeeStatus, employees]);
  const activeCount = filteredEmployees.filter((employee) => status(employee) === "active").length;
  const inactiveCount = filteredEmployees.filter((employee) => status(employee) === "inactive").length;
  const newEmployees = filteredEmployees.filter((employee) => isWithinPeriod(employee, from, to, "joinDate")).sort((a, b) => date(b, "joinDate").localeCompare(date(a, "joinDate")));
  const exitingEmployees = filteredEmployees.filter((employee) => status(employee) === "inactive" && isWithinPeriod(employee, from, to, "exitDate")).sort((a, b) => date(b, "exitDate").localeCompare(date(a, "exitDate")));
  const contractRows = filteredEmployees.filter((employee) => value(employee, "contractCloseFirst") || value(employee, "contractCloseSecond") || value(employee, "contractCloseThird") || value(employee, "contractCloseFourth") || value(employee, "contractCloseFiveth"));
  const expiringContracts = contractRows.filter((employee) => {
    const dates = ["contractCloseFirst", "contractCloseSecond", "contractCloseThird", "contractCloseFourth", "contractCloseFiveth"].map((key) => date(employee, key)).filter(Boolean).sort();
    const end = dates[0]; const today = new Date().toISOString().slice(0, 10); const limit = new Date(); limit.setDate(limit.getDate() + 90); const until = limit.toISOString().slice(0, 10);
    return end && end >= today && end <= until;
  });
  const disabledWorkers = filteredEmployees.filter((employee) => Boolean(value(employee, "detailDisabilitas"))).length;
  const reset = () => { setFrom(""); setTo(""); setEmployeeStatus("all"); setDepartment("all"); setHasRun(false); };
  const tableRows = (rows: EmployeeRecord[], render: (employee: EmployeeRecord, index: number) => React.ReactNode) => rows.slice(0, 100).map(render);

  return <div className="space-y-4">
    <Card><CardContent className="space-y-4 pt-4"><div className="flex flex-wrap items-end gap-2"><label className="text-xs">Date From<Input type="date" className="mt-1 h-8" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label className="text-xs">Date To<Input type="date" className="mt-1 h-8" value={to} onChange={(event) => setTo(event.target.value)} /></label><label className="text-xs">Status<select className="mt-1 block h-8 rounded-md border bg-background px-2 text-xs" value={employeeStatus} onChange={(event) => setEmployeeStatus(event.target.value)}><option value="all">All</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label><label className="text-xs">Department<select className="mt-1 block h-8 max-w-52 rounded-md border bg-background px-2 text-xs" value={department} onChange={(event) => setDepartment(event.target.value)}><option value="all">All Department</option>{departments.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><Button size="sm" onClick={() => setHasRun(true)} disabled={loading}><Play className="mr-1 size-3" />Run</Button><Button size="sm" variant="outline" onClick={reset}><RotateCcw className="mr-1 size-3" />Clear</Button></div><p className="text-xs text-muted-foreground">Filter berlaku untuk Demografi, Kontrak, Karyawan Baru, dan Karyawan Keluar. Periode memakai Join Date atau Exit Date sesuai report.</p></CardContent></Card>
    {hasRun && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Total Headcount</p><p className="text-2xl font-bold">{filteredEmployees.length}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Active</p><p className="text-2xl font-bold text-green-600">{activeCount}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Inactive</p><p className="text-2xl font-bold text-red-600">{inactiveCount}</p></CardContent></Card><Card><CardContent className="pt-4"><p className="text-xs text-muted-foreground">Penyandang Disabilitas</p><p className="text-2xl font-bold">{disabledWorkers}</p></CardContent></Card></div>}
    <Tabs defaultValue="demografi"><TabsList className="h-auto flex-wrap justify-start">{reports.map((report) => <TabsTrigger key={report.key} value={report.key}>{report.label}</TabsTrigger>)}</TabsList>
      <TabsContent value="demografi" className="mt-4">{hasRun ? <Card><CardContent className="space-y-3 pt-4"><div><h3 className="text-sm font-semibold">Breakdown Karyawan / Demografi</h3><p className="text-xs text-muted-foreground">Menampilkan maksimal 100 dari {filteredEmployees.length} data hasil filter.</p></div><CompactTable headers={["NIK", "Nama Karyawan", "Gender", "Usia", "Tanggal Masuk", "PKWT/PKWTT", "Departemen", "Jabatan", "Disabilitas", "Posisi"]}>{tableRows(filteredEmployees, (employee) => <tr key={employee.recordId}><td className="border px-3 py-2">{value(employee, "nik")}</td><td className="border px-3 py-2 font-medium">{value(employee, "name")}</td><td className="border px-3 py-2">{value(employee, "gender") || "—"}</td><td className="border px-3 py-2">{age(employee)}</td><td className="border px-3 py-2">{formatDate(date(employee, "joinDate"))}</td><td className="border px-3 py-2">{value(employee, "contractStatus") || "—"}</td><td className="border px-3 py-2">{value(employee, "department")}</td><td className="border px-3 py-2">{value(employee, "position")}</td><td className="border px-3 py-2">{value(employee, "detailDisabilitas") ? "Ya" : "Tidak"}</td><td className="border px-3 py-2">{workPosition(employee)}</td></tr>)}</CompactTable></CardContent></Card> : <EmptyReport title="Pilih filter lalu klik Run untuk melihat Demografi." />}</TabsContent>
      <TabsContent value="kontrak" className="mt-4">{hasRun ? <Card><CardContent className="space-y-3 pt-4"><div><h3 className="text-sm font-semibold">Report Kontrak Karyawan</h3><p className="text-xs text-muted-foreground">Kontrak yang akan berakhir dalam 90 hari: {expiringContracts.length} orang.</p></div><CompactTable headers={["NIK", "Nama", "Tanggal Masuk", "Status Kontrak", "Close First", "Close Second", "Close Third", "Masa Kerja"]}>{tableRows(contractRows, (employee) => <tr key={employee.recordId}><td className="border px-3 py-2">{value(employee, "nik")}</td><td className="border px-3 py-2 font-medium">{value(employee, "name")}</td><td className="border px-3 py-2">{formatDate(date(employee, "joinDate"))}</td><td className="border px-3 py-2">{value(employee, "contractStatus") || "—"}</td><td className="border px-3 py-2">{formatDate(date(employee, "contractCloseFirst"))}</td><td className="border px-3 py-2">{formatDate(date(employee, "contractCloseSecond"))}</td><td className="border px-3 py-2">{formatDate(date(employee, "contractCloseThird"))}</td><td className="border px-3 py-2">{value(employee, "masaKerja") || "—"}</td></tr>)}</CompactTable></CardContent></Card> : <EmptyReport title="Pilih filter lalu klik Run untuk melihat Report Kontrak." />}</TabsContent>
      <TabsContent value="baru" className="mt-4">{hasRun ? <Card><CardContent className="space-y-3 pt-4"><div><h3 className="text-sm font-semibold">Report Karyawan Baru</h3><p className="text-xs text-muted-foreground">Total join pada periode terpilih: {newEmployees.length} orang.</p></div><CompactTable headers={["NIK", "Nama Karyawan", "Tanggal Masuk", "Departemen", "Jabatan", "Status"]}>{tableRows(newEmployees, (employee) => <tr key={employee.recordId}><td className="border px-3 py-2">{value(employee, "nik")}</td><td className="border px-3 py-2 font-medium">{value(employee, "name")}</td><td className="border px-3 py-2">{formatDate(date(employee, "joinDate"))}</td><td className="border px-3 py-2">{value(employee, "department")}</td><td className="border px-3 py-2">{value(employee, "position")}</td><td className="border px-3 py-2">{value(employee, "status")}</td></tr>)}</CompactTable></CardContent></Card> : <EmptyReport title="Atur periode Join Date lalu klik Run." />}</TabsContent>
      <TabsContent value="keluar" className="mt-4">{hasRun ? <Card><CardContent className="space-y-3 pt-4"><div><h3 className="text-sm font-semibold">Report Karyawan Keluar</h3><p className="text-xs text-muted-foreground">Total keluar pada periode terpilih: {exitingEmployees.length} orang. Kompensasi belum memiliki sumber data.</p></div><CompactTable headers={["NIK", "Nama Karyawan", "Departemen", "Tanggal Keluar", "Jenis Keluar", "Alasan Keluar", "Kompensasi"]}>{tableRows(exitingEmployees, (employee) => <tr key={employee.recordId}><td className="border px-3 py-2">{value(employee, "nik")}</td><td className="border px-3 py-2 font-medium">{value(employee, "name")}</td><td className="border px-3 py-2">{value(employee, "department")}</td><td className="border px-3 py-2">{formatDate(date(employee, "exitDate"))}</td><td className="border px-3 py-2">{value(employee, "reason") || "—"}</td><td className="border px-3 py-2">{value(employee, "reason") || "—"}</td><td className="border px-3 py-2">Belum tersedia</td></tr>)}</CompactTable></CardContent></Card> : <EmptyReport title="Atur periode Exit Date lalu klik Run." />}</TabsContent>
      <TabsContent value="jamKerja" className="mt-4"><EmptyReport title="Report Jam Kerja & Lembur" /></TabsContent>
      <TabsContent value="cuti" className="mt-4"><EmptyReport title="Report Cuti" /></TabsContent>
      <TabsContent value="kompensasi" className="mt-4"><EmptyReport title="Pembayaran Kompensasi Kontrak" /></TabsContent>
      <TabsContent value="pensiun" className="mt-4"><EmptyReport title="Report Karyawan Pensiun" /></TabsContent>
      <TabsContent value="payroll" className="mt-4"><EmptyReport title="Payroll & Benefit" /></TabsContent>
      <TabsContent value="sp" className="mt-4"><EmptyReport title="Report Surat Peringatan (SP1 / SP2 / SP3)" /></TabsContent>
    </Tabs>
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><FileSpreadsheet className="size-3.5" />Export Excel akan dibuat setelah format final tiap report disetujui.</div>
  </div>;
}
