"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { CalculatedAttendanceRecord, CalculationSummary } from "@/lib/database/attendance-types";

const IDLE_LIMIT_MS = 8 * 60 * 60 * 1000;

type CalculationSessionValue = {
  rows: CalculatedAttendanceRecord[];
  setRows: React.Dispatch<React.SetStateAction<CalculatedAttendanceRecord[]>>;
  dateFrom: string;
  setDateFrom: React.Dispatch<React.SetStateAction<string>>;
  dateTo: string;
  setDateTo: React.Dispatch<React.SetStateAction<string>>;
  summary: CalculationSummary | null;
  setSummary: React.Dispatch<React.SetStateAction<CalculationSummary | null>>;
  clearSession: () => void;
};

const CalculationSessionContext = createContext<CalculationSessionValue | null>(null);

export function CalculationSessionProvider({ children }: { children: React.ReactNode }) {
  const [rows, setRows] = useState<CalculatedAttendanceRecord[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [summary, setSummary] = useState<CalculationSummary | null>(null);
  const lastActivityRef = useRef<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearSession() {
    setRows([]);
    setDateFrom("");
    setDateTo("");
    setSummary(null);
  }

  useEffect(() => {
    const scheduleExpiry = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      const lastActivity = lastActivityRef.current ?? Date.now();
      lastActivityRef.current = lastActivity;
      const remaining = Math.max(0, IDLE_LIMIT_MS - (Date.now() - lastActivity));
      timerRef.current = setTimeout(() => {
        if (Date.now() - (lastActivityRef.current ?? Date.now()) >= IDLE_LIMIT_MS) clearSession();
        scheduleExpiry();
      }, remaining || IDLE_LIMIT_MS);
    };
    lastActivityRef.current = Date.now();
    const onActivity = () => {
      lastActivityRef.current = Date.now();
      scheduleExpiry();
    };
    const events = ["pointerdown", "keydown", "mousemove", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, onActivity, { passive: true }));
    scheduleExpiry();
    return () => {
      events.forEach((event) => window.removeEventListener(event, onActivity));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const value = useMemo(() => ({ rows, setRows, dateFrom, setDateFrom, dateTo, setDateTo, summary, setSummary, clearSession }), [rows, dateFrom, dateTo, summary]);
  return <CalculationSessionContext.Provider value={value}>{children}</CalculationSessionContext.Provider>;
}

export function useCalculationSession() {
  const value = useContext(CalculationSessionContext);
  if (!value) throw new Error("useCalculationSession must be used inside CalculationSessionProvider");
  return value;
}
