// Initle as an installable app (a PWA): one codebase, installs from the browser on Android, iPhone,
// Mac, Windows and Chromebook. No app store.
import { useEffect, useState } from "react";

/** Chrome, Edge and Samsung Internet fire this when the site can be installed. */
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((fn) => fn());

const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
// iPadOS reports itself as a Mac; touch points tell them apart.
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isMacSafari = () => /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);

/** Call once at startup. */
export function registerApp() {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep it for our own "Install the app" button
    installEvent = e as InstallEvent;
    changed();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    changed();
  });
  // Not in development: a service worker would serve stale files while you edit.
  if (import.meta.env.PROD && "serviceWorker" in navigator) {
    window.addEventListener("load", () => void navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

function manualSteps(): string[] {
  if (isIos()) return ["Open Initle in Safari.", "Tap the Share button (the square with an arrow).", 'Tap "Add to Home Screen", then "Add".'];
  if (isMacSafari()) return ["In Safari's menu bar, open File (or tap the Share button).", 'Choose "Add to Dock".'];
  return [];
}

/**
 * `available`: show an install button. `prompt()` opens the browser's own install dialog and resolves
 * true if it did; false means the browser has none (iPhone, Mac Safari), so show `steps` instead.
 */
export function useInstall() {
  const [, bump] = useState(0);
  useEffect(() => {
    const fn = () => bump((n) => n + 1);
    listeners.add(fn);
    return () => void listeners.delete(fn);
  }, []);
  const steps = manualSteps();
  return {
    available: !isStandalone() && (installEvent !== null || steps.length > 0),
    steps,
    prompt: async (): Promise<boolean> => {
      const e = installEvent;
      if (!e) return false;
      await e.prompt();
      if ((await e.userChoice).outcome === "accepted") installEvent = null;
      changed();
      return true;
    },
  };
}
