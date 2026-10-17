/** Fullscreen must be requested synchronously inside the demo navigation click. */
export function openDemoFullscreen(event?: { ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }) {
  if (event && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
  if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => undefined);
}
