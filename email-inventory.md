# LINK STORE — transactional email inventory

Every email event on the platform, where it comes from, who it reaches, and how
it is kept exactly-once. This is the audit artifact for the email system
overhaul; `scripts/email-audit.mjs` verifies the "verified" column end to end.

Legend: **V** = verified end to end by `scripts/email-audit.mjs` ·
**C** = implemented and covered by the same delivery/dedupe machinery, but its
live trigger needs a real Paystack transaction and is verified by code path.

## Account and security

| # | Event | Trigger (backend source) | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|--------------------------|-----------|----------|------|----------|----------------------|
| 1 | Account created | better-auth `user.create.after` hook (`lib/auth/server.ts`) | the new account | `sendWelcomeEmail` | `welcome` | V | once per account row |
| 2 | Sign-in / verification code | better-auth `emailOTP` plugin (`sendVerificationOTP`) | the person signing in | `sendSignInCodeEmail` | `auth` | V | each code is its own event |
| 3 | Password reset requested | better-auth `sendResetPassword` (`/api/auth/request-password-reset`) | account owner | `sendPasswordResetEmail` | `password-reset` | V | none — every request needs its own fresh link |
| 4 | Password changed | better-auth `onPasswordReset` hook | account owner | `sendPasswordChangedEmail` | `password-changed` | V | once per completed reset |

No other account events exist: the auth engine does not enable e-mail change or
account recovery, so no email pretends otherwise.

## Orders — the buyer

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 5 | Order confirmed + receipt | `verifyAndFulfilPayment` → `deliverOrderMail`, **after** the atomic payment claim (`lib/server/commerce.ts`) | `orders.email` | `sendOrderInvoice` | `invoice` | V (food wording variant) | the payment claim admits one fulfilment per payment; "send again" is an explicit seller action |
| 6 | Ticket delivery | same trigger, when the order holds tickets | `orders.email` | `sendTicketDelivery` | `tickets` | V (5 tickets → 5 codes) | same claim; one email lists every ticket |
| 7 | Shipping milestone (shipped · in transit · out for delivery · ready for pickup) | `updateShipment` milestone gate (`lib/server/shipments.ts`, `NOTIFIED_STATES`) | `orders.email` | `sendShipmentUpdateEmail` | `update` | V | one email per real status change; location-only tweaks never mail |
| 8 | Order completed (delivered / picked up / fulfilled) | shipment terminal state **or** `setOrderStatus('fulfilled')` | `orders.email` | `sendOrderCompletedEmail` | `order-completed` | V | `dedupe_key: completed:{orderId}` — both paths, one email |
| 9 | Order cancelled (unpaid) | `setOrderStatus('cancelled')` | `orders.email` | `sendOrderCancelledEmail` | `order-cancelled` | V | `cancelled:{orderId}` + state transition |
| 10 | Payment failed | `verifyAndFulfilPayment` failure path **and** webhook `charge.failed` | `orders.email` | `sendPaymentFailedEmail` | `payment-failed` | C (mechanism verified by the recorded-failure test) | `payment-failed:{paymentId}` — webhook + callback + retry collapse to one |
| 11 | Refund issued | `refundOrder`, **after** Paystack accepts the refund | `orders.email` | `sendRefundEmails` | `refund` | V | `refund:{orderId}` |

"Payment successful" and "order completed" are deliberately different states:
the receipt (5) goes out at verified payment, the completion notice (8) only
when the order actually completes.

## Orders — the seller

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 12 | New order / new food order | `deliverSellerMail` after the payment claim (marketplace orders) | store owner (`stores.user_id` → `users.email`) | `sendSellerOrderEmail` | `seller-order` | V (food wording variant) | `seller-order:{orderId}` |
| 13 | Refund issued (seller copy) | `refundOrder` | store owner | `sendRefundEmails` | `refund-seller` | V | `refund-seller:{orderId}` |

Recipient determination is server-side throughout: buyers never receive seller
mail and vice versa. Chat orders skip #12 — their seller gets #16 instead.

## Chat payments (rentals, negotiated deals)

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 14 | Payment request sent | `createPaymentRequest` (`lib/server/payment-requests.ts`) | the buyer the request names | `sendPaymentRequestEmail` | `payment-request` | V | `payment-request:{id}`; the request row is created exactly once |
| 15 | Payment request cancelled | `cancelPaymentRequest`, only on the real state transition | the buyer | `sendPaymentRequestCancelledEmail` | `payment-cancelled` | V | `payment-cancelled:{id}` + `rowsAffected` guard on the cancel claim |
| 16 | Payment request paid | `syncPaymentRequestForPayment` success claim | store owner | `sendPaymentReceivedEmail` | `payment-received` | C (needs a live Paystack settlement; shares the tested claim gate) | `payment-received:{id}` — sent inside the atomic `status != 'paid'` claim |
| 17 | Payment failed (chat) | same as #10 | the buyer | `sendPaymentFailedEmail` | `payment-failed` | C | `payment-failed:{paymentId}` |

The buyer's "payment successful" for a chat deal is the receipt (#5) rendered in
payment wording — never a second email from the same settlement.

## Messages

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 18 | A message is waiting | `sendMessage`, only when the thread has no other unread message | the other party (`conversationParties` → `users.email`) | `sendMessageNotificationEmail` | `message` | V | quiet-thread rule + `message:{conversation}:{recipient}:{day}` — at most one per thread per day |

## Payouts

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 19 | Payout requested | `requestPayout` (`lib/server/insights.ts`) | store owner | `sendPayoutRequestedEmail` | `payout` | V | `payout:{payoutId}` |

## Events

| # | Event | Trigger | Recipient | Template | Kind | Verified | Duplicate protection |
|---|-------|---------|-----------|----------|------|----------|----------------------|
| 20 | Event time / location changed | `updateEvent` when a real field moved (`lib/server/events.ts`) | every valid ticket holder's email, once per person | `sendEventChangeEmail` | `event-update` | V | `event-update:{eventId}:{email}:{changedAt}`; re-saves that change nothing send nothing |
| 21 | Event cancelled | `updateEvent` / `setEventStatus` → `cancelled` | same | `sendEventChangeEmail` | `event-update` | V | same |

## Deliberately not implemented (no real backend event)

- **Payment request expired** — expiry is computed lazily and `expires_at` is
  never set by the current product; there is no honest transition to email on.
- **Payment initiated** — checkout's own redirect covers it; an email per
  attempt would be noise.
- **Payout completed / failed** — nothing in the backend moves a payout out of
  `pending` (disbursement is an operator action outside the app), so there is no
  event to hook. Wire these when payouts are disbursed in-app.
- **Email change, account recovery** — the auth engine does not expose these
  flows, so no such event exists.
- **Analytics / report emails** — not a platform feature.
- **Service/rental lifecycle emails** (accepted, rejected, scheduled…) — those
  states do not exist; services and rentals settle as orders and chat payments,
  and speak their own vocabulary there ("Your service order is confirmed",
  payment requests).
- **New-device sign-in notice** — not current platform behaviour; the password
  change/reset notices cover the security surface.

## Delivery architecture

- Sending is server-side only (`lib/server/email.ts`, `server-only`); the Resend
  key lives in `lib/env` and never reaches the client.
- Recipient addresses always come from database rows, never from client input.
- `sendEmail` never throws into a fulfilment path. Money and fulfilment are
  committed before mail is attempted; a mail failure is recorded and reported,
  and never reverses a purchase (verified: a message is delivered even when its
  email fails).
- Every attempt lands in `email_deliveries` (`sent | failed | skipped`) with the
  provider's id, so "no invoice arrived" has an answer a seller can look up —
  and the workspace's resend action reads that record.
- Idempotency: `email_deliveries.dedupe_key`, one key per event, held only by
  `sent` rows (a failed send stays retriable), with a partial unique index as
  the race-proof backstop. Migration: `npm run db:migrate`.
- Development only: every composed message is also written to
  `.email-outbox/` so rendered output can be audited. Nothing runs in
  production.

## Templates and branding

- One shell for every message (`lib/server/email-templates.ts`): the LINK ICON
  mark (`/brand/link-mark.png`, generated by `scripts/generate-brand-assets.mjs`)
  with the LINK STORE wordmark beside it, shared footer, one primary CTA,
  table-based inline-styled HTML, preheader, plain-text counterpart. The
  message still identifies the sender when images are blocked.
- URLs come from `NEXT_PUBLIC_APP_URL` (`https://link-store.quizmi.space`) via
  `requestBaseUrl()` / `platformConfig.appUrl`. The audit asserts that no email
  ever contains `localhost`.
- Currency via `formatMoney`, dates via `formatDateTime`; no internal ids are
  exposed (payout account numbers are masked to their last four digits).

## Bugs found and fixed during the audit

- `sendTicketDelivery` selected `e.venue`, a column that does not exist
  (`events.venue_name`) — **every ticket email would have failed**. Fixed.
- The event-change audit path revealed a per-ticket send loop; notices are sent
  once per holder (a five-ticket holder hears news once). The production path
  already deduplicated; the shared rule is now asserted.

## How to re-run the verification

```bash
npm run db:migrate        # once — adds email_deliveries.dedupe_key
node scripts/email-audit.mjs http://localhost:5000
```

66 checks covering: account, security, chat payment, message, order, food,
ticket (5×), completion, cancellation, refund (both sides), seller, shipping,
payout, and event emails — plus the platform-wide guarantees (production URLs,
brand mark, footer, plain-text counterparts, no duplicate keys, failure
isolation).
