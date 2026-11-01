export function cn(...parts: (string | number | false | null | undefined)[]): string {
  return parts.filter((p) => typeof p === "string" && p).join(" ");
}
