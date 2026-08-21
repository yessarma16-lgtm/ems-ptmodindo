"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

// Safety net in case a navigation never resolves (e.g. the user cancels it) —
// the bar shouldn't get stuck on screen forever.
const AUTO_HIDE_SAFETY_MS = 8000;

/**
 * Thin progress bar pinned to the top of the viewport. It never touches page
 * content — the previous page stays fully visible and interactive until the
 * new one has actually finished rendering, at which point Next.js swaps them
 * atomically and this bar completes/hides itself.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentKeyRef = useRef(`${pathname}?${searchParams.toString()}`);

  useEffect(() => {
    function clearTimers() {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      intervalRef.current = null;
      safetyTimeoutRef.current = null;
      hideTimeoutRef.current = null;
    }

    function finish() {
      clearTimers();
      setProgress(100);
      hideTimeoutRef.current = setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 200);
    }

    function start() {
      clearTimers();
      setVisible(true);
      setProgress(15);
      intervalRef.current = setInterval(() => {
        setProgress((p) => (p >= 88 ? p : p + (88 - p) * 0.1));
      }, 200);
      safetyTimeoutRef.current = setTimeout(finish, AUTO_HIDE_SAFETY_MS);
    }

    const key = `${pathname}?${searchParams.toString()}`;
    if (key !== currentKeyRef.current) {
      currentKeyRef.current = key;
      finish();
    }

    function isInternalNavClick(e: MouseEvent): boolean {
      if (e.defaultPrevented || e.button !== 0) return false;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest("a");
      if (!anchor) return false;
      if (anchor.target && anchor.target !== "_self") return false;
      if (anchor.hasAttribute("download")) return false;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return false;
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return false;
      }
      if (url.origin !== window.location.origin) return false;
      const destKey = `${url.pathname}${url.search}`;
      const currentKey = `${window.location.pathname}${window.location.search}`;
      return destKey !== currentKey;
    }

    function onClick(e: MouseEvent) {
      if (isInternalNavClick(e)) start();
    }

    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimers();
    };
  }, [pathname, searchParams]);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 bg-transparent">
      <div
        className="h-full bg-primary transition-[width] duration-200 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
