import { useEffect, useState } from "react";

/** Milliseconds left until a server deadline, corrected by the client/server clock offset. */
export function useCountdown(deadline: number | null, offset: number, intervalMs = 100): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [deadline, intervalMs]);
  if (deadline === null) return 0;
  return Math.max(0, deadline - (now + offset));
}
