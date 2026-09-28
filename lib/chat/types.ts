/**
 * The chat system's shared contracts.
 *
 * One set of shapes for the whole conversation surface — the server writes
 * these, the realtime channel carries them, and the chat UI renders them. The
 * client never invents a message state: `readAt` is a database column, and a
 * message only exists once the backend has confirmed it (a message without an
 * `id` is one still on its way out).
 */

/** One piece of media on a message. The URL is always resolved server-side. */
export type ChatAttachment = {
  key: string;
  url: string;
  fileName: string;
  contentType: string;
  size: number;
};

/**
 * A payment request, as the payment card in a conversation renders it.
 *
 * Everything the card shows is here — the agreed amount, what it is for, whose
 * it is and where it stands — and nothing the card must not show. The status is
 * always the backend's own state, never anything a client invented.
 */
export type ChatPaymentRequestDto = {
  id: string;
  /** The agreed amount in minor units. Immutable since it was sent. */
  amount: number;
  currency: string;
  description: string | null;
  status: "awaiting_payment" | "processing" | "paid" | "failed" | "expired" | "cancelled";
  /** The product/listing this negotiated payment relates to, when there is one. */
  listingId: string | null;
  /** Context, frozen as it was agreed — what the card shows, never internal ids. */
  contextTitle: string | null;
  contextImageUrl: string | null;
  sellerName: string | null;
  /** The listing's advertised price at creation — shown only when it differs. */
  originalAmount: number | null;
  /** Who was asked to pay. The client compares this with its viewer. */
  recipientUserId: string;
  createdAt: string;
  paidAt: string | null;
  expiresAt: string | null;
};

/** A message as every surface sees it. */
export type ChatMessageDto = {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachments: ChatAttachment[];
  /** The payment request this message is the card for, when it carries one. */
  paymentRequestId: string | null;
  /** The card's live state — attached by the server, updated by the server. */
  paymentRequest: ChatPaymentRequestDto | null;
  /** When the other side read it — only set once they actually have. */
  readAt: string | null;
  /** When the sender last changed the words — shown as a quiet "edited". */
  editedAt: string | null;
  /**
   * Removed for everyone: the shared tombstone. The words are gone from the
   * record and from both sides; the row stays so both see the same quiet
   * "Message deleted" in its place.
   */
  deletedAt: string | null;
  createdAt: string;
};

/**
 * The message model the conversation surface renders.
 *
 * One shape for both halves of a message's life: `id === null` means it is
 * still on its way out (with `status` saying how that is going), and a set `id`
 * means the backend has confirmed it. The `key` is stable across the handover,
 * so a confirmed send settles into place instead of reappearing.
 */
export type MessageModel = {
  key: string;
  id: string | null;
  conversationId: string;
  senderUserId: string;
  body: string;
  attachments: ChatAttachment[];
  /** The payment request this message is the card for, when it carries one. */
  paymentRequestId: string | null;
  paymentRequest: ChatPaymentRequestDto | null;
  readAt: string | null;
  editedAt: string | null;
  /** The shared tombstone — set once the message was removed for everyone. */
  deletedAt: string | null;
  createdAt: string;
  /** Present only while the message is still on its way out. */
  status?: "sending" | "failed";
};

/**
 * What the realtime channel carries. Every event names its audience — the two
 * people party to the conversation — so a stream only ever delivers what its
 * signed-in user is party to.
 */
export type ChatRealtimeEvent =
  | { type: "message"; audience: string[]; message: ChatMessageDto }
  | {
      type: "read";
      audience: string[];
      conversationId: string;
      readerUserId: string;
      readAt: string;
    }
  | { type: "conversation"; audience: string[]; conversationId: string }
  | { type: "message-updated"; audience: string[]; message: ChatMessageDto }
  | {
      type: "message-removed";
      audience: string[];
      conversationId: string;
      /** A message id removes one message; null clears the thread for that viewer. */
      messageId: string | null;
      /** When the viewer's own state changed — the same clock the database used. */
      at: string;
    };
