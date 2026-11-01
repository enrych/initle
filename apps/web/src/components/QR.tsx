import QRCode from "qrcode";
import { useEffect, useState } from "react";

export function QR({ value, size = 180, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 1, width: size * 2, color: { dark: "#0b0d1a", light: "#ffffff" } })
      .then((url) => alive && setSrc(url))
      .catch(() => setSrc(null));
    return () => {
      alive = false;
    };
  }, [value, size]);
  return src ? <img src={src} width={size} height={size} alt={`QR code for ${value}`} className={className ?? "rounded-2xl"} /> : <div style={{ width: size, height: size }} className="rounded-2xl bg-surface-2" />;
}
