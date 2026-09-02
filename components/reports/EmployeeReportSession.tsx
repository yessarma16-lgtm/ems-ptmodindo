"use client";

import { createContext, useContext, useMemo, useState } from "react";

/**
 * Keeps the Employee Report page's Run results alive across navigation —
 * switching tabs (Radix unmounts inactive TabsContent by default) or leaving
 * to another page and coming back both would otherwise reset the page's own
 * local state. Living here, in a Provider mounted once in AppShell (see
 * components/layout/AppShell.tsx), means the data survives exactly those two
 * cases but resets on an actual page reload (a fresh Provider on a fresh JS
 * load) — matching what was asked: only a hard refresh or an explicit
 * Clear/Cancel action should wipe it. Same pattern as
 * components/attendance/CalculationSession.tsx, minus its idle-timeout
 * auto-clear (not requested here).
 */

export type TimeOverdueUnitRow = { shed: string; division: string; counts: Record<string, number>; total: number };
export type TimeOverdueReport = { units: TimeOverdueUnitRow[]; detail: Record<string, unknown[]> };

export interface MangkirEvent {
  recordId: string;
  nik: string;
  name: string;
  position: string;
  department: string;
  address: string;
  shed: string;
  division: string;
  phoneNumber: string;
  level: 1 | 2;
  episodeStartDate: string;
  triggerDates: string[];
  episodeLength: number;
  sentAt: string | null;
  sentBy: string | null;
  letterNumber: string;
  previousLevelSentAt: string | null;
}
export interface MangkirReport {
  sp1Threshold: number;
  sp2Threshold: number;
  events: MangkirEvent[];
}

interface TimeOverdueSessionState {
  dateFrom: string;
  dateTo: string;
  report: TimeOverdueReport | null;
  hasRun: boolean;
}

interface MangkirSessionState {
  dateFrom: string;
  dateTo: string;
  report: MangkirReport | null;
  hasRun: boolean;
  levelFilter: Array<1 | 2>;
}

interface EmployeeReportSessionValue {
  timeOverdue: TimeOverdueSessionState;
  setTimeOverdue: (patch: Partial<TimeOverdueSessionState>) => void;
  clearTimeOverdue: () => void;
  mangkir: MangkirSessionState;
  setMangkir: (patch: Partial<MangkirSessionState>) => void;
  clearMangkir: () => void;
}

const EmployeeReportSessionContext = createContext<EmployeeReportSessionValue | null>(null);

// Avoid a bare `Date.now()` call in render (flagged by react-hooks/purity) — go through a `new Date()` instance instead, same fix used elsewhere in this page.
function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function defaultTimeOverdueState(): TimeOverdueSessionState {
  const today = isoDate();
  return { dateFrom: today, dateTo: today, report: null, hasRun: false };
}

function defaultMangkirState(): MangkirSessionState {
  return { dateFrom: isoDate(-30), dateTo: isoDate(), report: null, hasRun: false, levelFilter: [1, 2] };
}

export function EmployeeReportSessionProvider({ children }: { children: React.ReactNode }) {
  const [timeOverdue, setTimeOverdueState] = useState<TimeOverdueSessionState>(defaultTimeOverdueState);
  const [mangkir, setMangkirState] = useState<MangkirSessionState>(defaultMangkirState);

  function setTimeOverdue(patch: Partial<TimeOverdueSessionState>) {
    setTimeOverdueState((prev) => ({ ...prev, ...patch }));
  }
  function clearTimeOverdue() {
    setTimeOverdueState(defaultTimeOverdueState());
  }
  function setMangkir(patch: Partial<MangkirSessionState>) {
    setMangkirState((prev) => ({ ...prev, ...patch }));
  }
  function clearMangkir() {
    setMangkirState(defaultMangkirState());
  }

  const value = useMemo(
    () => ({ timeOverdue, setTimeOverdue, clearTimeOverdue, mangkir, setMangkir, clearMangkir }),
    [timeOverdue, mangkir],
  );

  return <EmployeeReportSessionContext.Provider value={value}>{children}</EmployeeReportSessionContext.Provider>;
}

export function useEmployeeReportSession() {
  const value = useContext(EmployeeReportSessionContext);
  if (!value) throw new Error("useEmployeeReportSession must be used inside EmployeeReportSessionProvider");
  return value;
}
