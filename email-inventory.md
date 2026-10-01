# Rush Cart — transactional email audit

## Current supported events

All mail is composed by `lib/server/email.ts` and the shared table/inline-style
shell in `lib/server/email-templates.ts`. Every send has HTML and plain text.

| Event | Recipient | Trigger |
| --- | --- | --- |
| Sign-in/verification code | Account address | Registration or authentication OTP |
| Welcome | New account | Account creation |
| Password reset | Account address | Reset request |
| Password changed | Account address | Completed password reset |
| Order confirmation/receipt | Order buyer | Server-verified payment, after settlement |
| Shipping update | Order buyer | Seller-reported shipment milestone |
| Order completed/cancelled | Order buyer | Authorised fulfilment/cancellation |
| Payment failed | Order buyer | Verified failure |
| Refund submitted | Buyer and seller | Payment provider accepts refund request |
| New paid order | Store owner | Verified marketplace settlement |
| Chat payment request/cancellation | Conversation buyer | Seller request/cancellation |
| Chat payment received | Store owner | Verified request settlement |
| Waiting message | Other conversation participant | Quiet-thread/unread notification gate |
| Payout requested | Store owner | Recorded payout request |

Events are product collections. They do **not** send ticket, attendance, QR
admission or event-holder emails. There is no marketing/subscription mailing
feature, no invented new-device notification and no invented payout-completion
trigger.

## Logo strategy (Resend documentation verified)

- Actual supplied PNG: `public/brand/rush-cart-logo.png`, downloaded locally.
- HTML: `<img src="cid:rush-cart-logo" ...>` with width and automatic height.
- Resend HTTP payload: base64 file content, `filename: rush-cart-logo.png`,
  `content_id: rush-cart-logo`.
- No Catbox URL, localhost image, R2 URL, signed URL or relative image path.
- Asset is included in Next server file tracing for deployment packaging.
- Text Rush Cart branding remains visible if images are blocked.
- This uses the single-send endpoint; Resend's batch endpoint does not support
  inline attachments.

Provider source: https://resend.com/docs/dashboard/emails/embed-inline-images

`npm test` asserts that attachment bytes equal the actual PNG, HTML references
the matching CID, text is present, links are safe, and sending/dedupe payloads
are correct. Sending is **mocked**, not an inbox-rendering claim. The user
explicitly requested no live sends. Gmail/Outlook/Apple Mail rendering still
needs a permitted test send and recipient-side inspection.

## Sender and URLs

Existing configuration remains authoritative:

- `RESEND_API_KEY`: server only.
- `RESEND_FROM_EMAIL`: authenticated sending address. No default production
  `resend.dev` sender; delivery is refused until a sender is configured.
- `RESEND_REPLY_TO_EMAIL`: optional valid, monitored support mailbox.
- `NEXT_PUBLIC_APP_URL`: existing public production HTTPS origin. Do not invent
  a new hostname because the product name changed. The previous deployment
  hostname can remain until the operator changes the domain deliberately.

The mail boundary refuses local/private, development/preview, raw-storage and
internal API URLs. Unsafe product thumbnails are omitted; receipts still send
with product names and quantities. Reset links land on the app's reset screen,
orders on their order page, conversations/payment requests on their thread,
and seller notices in the seller's workspace.

Resend receives stable `Idempotency-Key` headers for deduplicated events. Its
24-hour provider window supplements persisted sent-event keys; it is not a
permanent exactly-once guarantee under all outages.

Source: https://resend.com/docs/dashboard/emails/idempotency-keys

## Deliverability — operator verification still required

No application can guarantee inbox placement or "never spam". No DNS or Resend
account administration was performed, and no live mail was sent.

For the domain in the **existing** `RESEND_FROM_EMAIL`, the operator must:

1. Open that domain in Resend and confirm its sending status is Verified.
2. Publish the **exact** DKIM TXT record(s) and SPF/return-path records displayed
   by Resend for this domain/region. Do not copy guessed selectors, DKIM keys,
   region-specific MX targets or a second conflicting SPF record from a guide.
3. Confirm public DNS resolves those records and Resend passes verification.
4. Inspect `_dmarc.<sender-domain>` and publish a reviewed DMARC policy if
   missing. Initially monitor with `v=DMARC1; p=none; rua=mailto:<monitored-report-address>`;
   replace the address with a real mailbox and review all legitimate senders
   before progressing to quarantine/reject. Never invent a report mailbox.
5. Send a permitted real test and inspect recipient `Authentication-Results`:
   SPF pass, DKIM pass, DMARC pass and From-domain alignment. DKIM alignment
   can establish DMARC even when the envelope return-path is a subdomain.
6. Inspect Received headers for transport/TLS, MIME multipart HTML/plain text,
   Content-ID matching, valid Message-ID and the consistent Rush Cart From and
   monitored Reply-To identity. Resend constructs SMTP/MIME headers; the app
   uses HTTPS to its API and does not spoof Message-ID or authentication results.
7. Monitor bounces/complaints and suppress invalid recipients operationally.
   Bounce webhook processing is not implemented by this pass; do not describe
   API acceptance as delivery to an inbox.
8. If marketing is introduced later, require appropriate consent, an actual
   suppression/preferences system, and compliant unsubscribe/one-click headers
   before sending. Transactional security/order messages are not promotional.

Source: https://resend.com/docs/dashboard/domains/dmarc

## Re-running local checks

```bash
npm test
npm run build
npm run test:journeys
```

Tests use disposable databases and mocked/disabled email and payment providers.
They do not read `.env.local` credentials for database mutation or sending.
