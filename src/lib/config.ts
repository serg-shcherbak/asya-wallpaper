export const SELECTION_THRESHOLD = 6;

export function safeContactUrl(value = process.env.NEXT_PUBLIC_CONTACT_URL ?? ""): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return ["https:", "mailto:", "tg:"].includes(url.protocol) ? value : null;
  } catch {
    return null;
  }
}

export const CONTACT_URL = safeContactUrl();
