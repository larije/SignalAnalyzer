export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "signal-analyzer-theme";
// Run in the document head so the saved palette is applied before first paint.
export const THEME_INIT_SCRIPT = `(()=>{let theme="light";try{if(localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})==="dark")theme="dark";}catch{}document.documentElement.dataset.theme=theme;})();`;

export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // The current page can still change theme when storage is unavailable.
  }
}

export function tint(color: string, hexAlpha: string): string {
  const opacity = Number((parseInt(hexAlpha, 16) / 255 * 100).toFixed(2));
  return `color-mix(in srgb, ${color} ${opacity}%, transparent)`;
}
