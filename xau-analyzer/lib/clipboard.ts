export function priceCopyText(value: number): string | null {
  return Number.isFinite(value) && value > 0 ? value.toFixed(2) : null;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  // Older browsers and local-network HTTP may not expose the Clipboard API.
  const previousFocus = document.activeElement as HTMLElement | null;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "0";
  document.body.appendChild(textarea);
  try {
    textarea.select();
    if (!document.execCommand("copy")) throw new Error("Clipboard unavailable");
  } finally {
    textarea.remove();
    previousFocus?.focus?.({ preventScroll: true });
  }
}
