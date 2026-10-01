/** Pure email safety rules shared by sending and regression tests. */
export function escapeEmailHtml(value: string): string {
  return value.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export function isProductionEmailUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return url.protocol === "https:" && !url.username && !url.password &&
      host.includes(".") && !/^(localhost|127\.|0\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) &&
      !/\.(localhost|local|internal|test|example)$/.test(host) &&
      !/(^|\.)(replit\.dev|vercel\.app|netlify\.app|r2\.dev|cloudflarestorage\.com|catbox\.moe)$/.test(host) &&
      !/^\/api(?:\/|$)/.test(url.pathname);
  } catch { return false; }
}

export function emailSafetyError(input: { html: string; text: string; subject: string }, appUrl: string): string | null {
  if (!isProductionEmailUrl(appUrl)) return "Configure a public HTTPS application URL before sending email.";
  if (/\r|\n/.test(input.subject)) return "Email subject is not valid.";
  const links = [...input.html.matchAll(/(?:href|src)\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
  const plainLinks = input.text.match(/https?:\/\/[^\s<>]+/g) ?? [];
  for (const link of [...links, ...plainLinks]) {
    if (link === "cid:rush-cart-logo") continue;
    if (!isProductionEmailUrl(link.replace(/&amp;/g, "&"))) return "An email link is not safe for production delivery.";
  }
  return null;
}
