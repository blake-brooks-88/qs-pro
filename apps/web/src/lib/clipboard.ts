function fallbackCopy(text: string): boolean {
  if (typeof document === "undefined") {
    return false;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";

  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  let didCopy = false;
  try {
    didCopy = document.execCommand("copy");
  } finally {
    document.body.removeChild(textarea);
  }

  return didCopy;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  // Try synchronous copy first while still inside the user gesture.
  if (fallbackCopy(text)) {
    return true;
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
