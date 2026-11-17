/**
 * Google H5 Games Ads (Ad Placement API).
 *
 * On by default with Enrych's publisher ID. Set VITE_ADSENSE_CLIENT=off to build without ads.
 * Ads only ever run in Solo and Daily, never in Party rooms or on the stage screen.
 * Ad blockers are fine: if the script never loads, every call resolves at once and the game carries on.
 */

const ENV = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined;
const CLIENT = ENV === "off" ? undefined : ENV || "ca-pub-4399872503638784";

type AdBreakOptions = {
  type: "preroll" | "start" | "pause" | "next" | "browse" | "reward";
  name: string;
  beforeAd?: () => void;
  afterAd?: () => void;
  beforeReward?: (showAdFn: () => void) => void;
  adDismissed?: () => void;
  adViewed?: () => void;
  adBreakDone?: (info: { breakStatus: string }) => void;
};

declare global {
  interface Window {
    adsbygoogle?: unknown[];
    adBreak?: (o: AdBreakOptions) => void;
    adConfig?: (o: Record<string, unknown>) => void;
  }
}

let started = false;
let blocked = false; // script failed to load (ad blocker, offline): skip ad breaks entirely

export const adsEnabled = Boolean(CLIENT);

export function initAds() {
  if (!CLIENT || started) return;
  started = true;
  window.adsbygoogle = window.adsbygoogle || [];
  window.adBreak = window.adConfig = (o: object) => {
    window.adsbygoogle!.push(o);
  };
  const s = document.createElement("script");
  s.async = true;
  s.crossOrigin = "anonymous";
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`;
  s.dataset.adFrequencyHint = "60s";
  if (import.meta.env.DEV) s.dataset.adbreakTest = "on";
  s.onerror = () => {
    blocked = true;
  };
  document.head.appendChild(s);
  window.adConfig({ preloadAdBreaks: "on", sound: "on" });
}

/**
 * Interstitial at a natural pause. Resolves when the game may continue.
 * If no ad starts within 1.5s (blocked, no fill, frequency cap), it resolves anyway.
 */
export function interstitial(name: string, onPause?: () => void, onResume?: () => void): Promise<void> {
  if (!CLIENT || blocked || !window.adBreak) return Promise.resolve();
  return new Promise((resolve) => {
    let showing = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve();
    };
    const timer = setTimeout(() => !showing && finish(), 1500);
    window.adBreak!({
      type: "next",
      name,
      beforeAd: () => {
        showing = true;
        onPause?.();
      },
      afterAd: () => onResume?.(),
      adBreakDone: () => {
        clearTimeout(timer);
        finish();
      },
    });
  });
}

/**
 * Rewarded ad. Calls `ready(show)` only if an ad is available; resolves true if the player watched it.
 * Resolves false when no ad is available, so the caller can simply hide the offer.
 */
export function rewarded(name: string, ready: (show: () => void) => void): Promise<boolean> {
  if (!CLIENT || blocked || !window.adBreak) return Promise.resolve(false);
  return new Promise((resolve) => {
    let rewardedOk = false;
    window.adBreak!({
      type: "reward",
      name,
      beforeReward: (showAdFn) => ready(showAdFn),
      adViewed: () => {
        rewardedOk = true;
      },
      adDismissed: () => {
        rewardedOk = false;
      },
      adBreakDone: () => resolve(rewardedOk),
    });
  });
}
