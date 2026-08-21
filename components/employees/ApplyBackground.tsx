/**
 * Shared full-bleed background wrapper for the public /apply and
 * /apply/walkin pages — admin-uploaded via Settings, falls back to a plain
 * background when nothing has been uploaded. Server-safe (no "use client"),
 * so both pages' Server Components can use it directly.
 */
export function ApplyBackground({
  backgroundDataUri,
  children,
}: {
  backgroundDataUri?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen">
      {backgroundDataUri && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={backgroundDataUri}
            alt=""
            aria-hidden
            className="fixed inset-0 -z-10 size-full object-cover opacity-25 blur-md"
          />
          <div aria-hidden className="fixed inset-0 -z-10 bg-background/70" />
        </>
      )}
      {children}
    </div>
  );
}
