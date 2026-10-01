import { resolveTxt, resolveMx } from 'node:dns/promises';
import { loadEnv } from './load-env.mjs';
loadEnv();
const from = process.env.RESEND_FROM_EMAIL?.trim() ?? '';
const address = from.match(/<([^>]+)>/)?.[1] ?? from;
const domain = address.split('@')[1];
console.log('Email provider: Resend');
console.log(`Sender domain: ${domain || 'not configured'}`);
console.log(`Rush Cart display name: ${/^Rush Cart\s*</.test(from) ? 'configured' : 'needs review'}`);
const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL;
try { console.log(`Configured app origin: ${new URL(appUrl).origin}`); } catch { console.log('Configured app origin: missing/invalid'); }
console.log(`Reply-To: ${process.env.RESEND_REPLY_TO_EMAIL ? 'configured (validity checked at send boundary)' : 'not configured'}`);
if (domain) {
  for (const host of [domain, `_dmarc.${domain}`, `send.${domain}`, `resend._domainkey.${domain}`]) {
    try { const records = (await resolveTxt(host)).map(parts => parts.join('')); const relevant = records.filter(record => /v=spf1|v=DMARC1|v=DKIM1|p=/i.test(record)); console.log(`${host}: ${relevant.length ? relevant.map(record => /v=DKIM1|p=[A-Za-z0-9+/]{20}/.test(record) ? 'DKIM TXT present (key omitted)' : record).join(' | ') : 'no authentication TXT found'}`); }
    catch (error) { console.log(`${host}: DNS lookup unavailable (${error.code ?? 'unknown'})`); }
  }
  try { console.log(`send.${domain} MX: ${(await resolveMx(`send.${domain}`)).map(record => record.exchange).join(', ')}`); } catch { console.log('Resend return-path MX not confirmed at default send subdomain.'); }
}
console.log('Selectors/return-path can be customised. Default-name DNS presence is not proof of Resend verification, sender alignment, TLS or recipient delivery. No sends or DNS changes performed.');
