/** Fallback for silent clients: 180 words/minute, with pauses between sentences. */
export function speechDuration(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const pauses = text.match(/[.!?;:]/g)?.length ?? 0;
  return Math.max(1000, Math.ceil(words * (60_000 / 180) + pauses * 150 + 500));
}
