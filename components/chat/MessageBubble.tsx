"use client";

/**
 * One message, as its own composition.
 *
 * A bubble is not a card with text in it: it is a shaped object with a soft
 * tail toward its sender, its own typography, and its media laid out as message
 * content rather than as files dropped in a box. Every message is a normal
 * flow block that takes its own height from its content — one line, many
 * lines, links, media, any width — so nothing can ever sit on top of anything.
 *
 * A photograph is different from text and is drawn differently: the image
 * *is* the object — no bubble around it, no purple field padding it out. It
 * wears the same quiet ring the platform's active elements do, it keeps its
 * own proportions (portrait, landscape or square — never stretched), and it
 * opens to a full preview when tapped. The delivery state sits cleanly
 * beneath it, exactly as it does beneath words.
 *
 * A message is also a thing that can be acted on: a long press — or a right
 * click at a pointer — brings the small menu of real actions in the
 * platform's own language, never the browser's generic one. And a message
 * removed for everyone stays in its place as a quiet tombstone, so the
 * conversation keeps its shape while the words are gone.
 *
 * The state beneath it is quiet on purpose: the words appear the instant they
 * are sent, a single check mark appears once the backend has confirmed them,
 * and a failure says only that, with the way to try again. No spinners, no
 * labels, nothing technical.
 */

import { useRef, useState } from "react";

import { ImagePreview } from "@/components/chat/ImagePreview";
import { PaymentRequestCard } from "@/components/chat/PaymentRequestCard";
import {
  MessageActionsMenu,
  type MenuAnchor,
  type MessageAction,
} from "@/components/chat/MessageActionsMenu";
import { Icon } from "@/components/ui/Icon";
import { formatClock, formatSize, isAudio, isImage, isVideo } from "@/lib/chat/media";
import type { ChatAttachment, MessageModel } from "@/lib/chat/types";

export type { MessageModel } from "@/lib/chat/types";

/** A press this long, held still, opens the actions menu. */
const LONG_PRESS_MS = 420;

/** A press that wanders further than this was a scroll, not a press. */
const PRESS_SLOP_PX = 8;

/* ---------------------------------------------------------------------- */
/* Media                                                                    */
/* ---------------------------------------------------------------------- */

/**
 * A photograph, as the primary visual object.
 *
 * The image is the surface; the ring around it is the same quiet treatment the
 * platform gives active elements — a hairline, a soft elevation, a touch of
 * accent on hover. Nothing of the message bubble surrounds it. The image keeps
 * its own proportions inside firm bounds, so a portrait stays a portrait and a
 * square stays a square.
 */
function ImageView({
  attachment,
  onOpen,
}: {
  attachment: ChatAttachment;
  onOpen: (attachment: ChatAttachment) => void;
}) {
  return (
    <button
      aria-label={`View ${attachment.fileName}`}
      className="group/media relative block overflow-hidden rounded-[1.25rem] bg-surface-secondary/60 shadow-elev-1 ring-1 ring-foreground/12 transition-all duration-200 hover:ring-accent/45 motion-safe:active:scale-[0.98]"
      onClick={() => onOpen(attachment)}
      type="button"
    >
      <img
        alt={attachment.fileName}
        className="block max-h-[26rem] w-auto max-w-[min(70vw,18.5rem)]"
        loading="lazy"
        src={attachment.url}
      />
    </button>
  );
}

/** Non-image media inside a bubble — video, audio and files, as before. */
export function AttachmentView({ attachment }: { attachment: ChatAttachment }) {
  if (isVideo(attachment.contentType)) {
    return (
      // eslint-disable-next-line jsx-a11y/media-has-caption
      <video
        className="max-h-80 w-full rounded-2xl bg-black/80"
        controls
        playsInline
        preload="metadata"
        src={attachment.url}
      />
    );
  }

  if (isAudio(attachment.contentType)) {
    return (
      <div className="flex min-w-56 flex-col gap-1.5">
        <p className="flex items-center gap-1.5 text-[11.5px] opacity-80">
          <Icon name="file" size={12} />
          <span className="truncate">{attachment.fileName}</span>
        </p>
        {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
        <audio className="w-full" controls preload="metadata" src={attachment.url} />
      </div>
    );
  }

  return (
    <a
      className="flex items-center gap-2.5 rounded-2xl bg-black/5 px-3.5 py-3 no-underline transition-colors hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15"
      href={attachment.url}
      rel="noreferrer"
      target="_blank"
    >
      <Icon name="file" size={18} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-medium">{attachment.fileName}</span>
        <span className="block text-[11.5px] opacity-70">{formatSize(attachment.size)}</span>
      </span>
      <Icon name="download" size={15} className="shrink-0 opacity-70" />
    </a>
  );
}

/* ---------------------------------------------------------------------- */
/* State                                                                    */
/* ---------------------------------------------------------------------- */

/**
 * What happened to my words — and only ever facts:
 *
 *   on its way  → just the time, no indicator of any kind
 *   confirmed   → one check mark
 *   read        → two check marks (only once they have actually been read)
 *   edited      → one quiet word beside the time
 *   failed      → said plainly, with the way to try again
 */
export function MessageStatus({
  status,
  readAt,
  edited,
  createdAt,
  onRetry,
}: {
  status: "sending" | "sent" | "failed";
  readAt: string | null;
  /** The words were changed after they were sent — stated quietly. */
  edited: boolean;
  createdAt: string;
  onRetry?: () => void;
}) {
  return (
    <span className="flex items-center gap-1.5 px-1.5 pt-0.5 text-[11px] text-muted">
      <span>{formatClock(createdAt)}</span>
      {edited ? (
        <>
          <span aria-hidden="true">·</span>
          <span>Edited</span>
        </>
      ) : null}
      {status === "failed" ? (
        <>
          <span aria-hidden="true">·</span>
          <span className="font-medium text-danger">Not sent</span>
          {onRetry ? (
            <button
              className="font-semibold text-danger underline-offset-2 hover:underline"
              onClick={onRetry}
              type="button"
            >
              Retry
            </button>
          ) : null}
        </>
      ) : status === "sending" ? null : readAt ? (
        <span className="flex items-center gap-0.5 text-accent" title="Read">
          <Icon name="check" size={12} />
          <Icon className="-ml-1.5" name="check" size={12} />
          <span className="sr-only">Read</span>
        </span>
      ) : (
        <span className="flex items-center gap-0.5" title="Sent">
          <Icon name="check" size={12} />
          <span className="sr-only">Sent</span>
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------------- */
/* Bubble                                                                   */
/* ---------------------------------------------------------------------- */

function isPending(message: MessageModel): boolean {
  return message.id === null;
}

export function MessageBubble({
  message,
  mine,
  /** Flatten the corner toward the sender on the last bubble of a run. */
  tail = false,
  showStatus = false,
  /** Something in this run of messages was edited after it was sent. */
  runEdited = false,
  onRetry,
  onAction,
}: {
  message: MessageModel;
  mine: boolean;
  tail?: boolean;
  showStatus?: boolean;
  runEdited?: boolean;
  onRetry?: (key: string) => void;
  /** The real actions this message offers — opened by long press or right click. */
  onAction?: (action: MessageAction, message: MessageModel) => void;
}) {
  const [preview, setPreview] = useState<ChatAttachment | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<MenuAnchor | null>(null);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  const suppressClick = useRef(false);

  const deleted = message.deletedAt !== null;
  // The run's footer states the edit once for the whole run — and a removed
  // message says only that it was removed.
  const edited = !deleted && (message.editedAt !== null || runEdited);
  const images = deleted ? [] : message.attachments.filter((a) => isImage(a.contentType));
  const others = deleted ? [] : message.attachments.filter((a) => !isImage(a.contentType));
  // A payment request is its own object in the thread — the card is the
  // message, and the words behind it are only its place in the history.
  const payment = deleted ? null : message.paymentRequest;
  const hasText = !deleted && !payment && Boolean(message.body);
  const hasBubble = !payment && (hasText || others.length > 0);

  /* ------------------------------------------------------------------ */
  /* Long press — and the pointer's own equivalent                       */
  /* ------------------------------------------------------------------ */

  const openMenu = () => {
    const el = wrapRef.current;
    if (!el || !onAction) return;
    const rect = el.getBoundingClientRect();
    setMenuAnchor({ x: rect.left + rect.width / 2, y: rect.top });
  };

  const cancelPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const startPress = (event: React.PointerEvent<HTMLDivElement>) => {
    // A mouse has a better gesture already: the right button.
    if (event.pointerType === "mouse" || !onAction) return;
    cancelPress();
    pressStart.current = { x: event.clientX, y: event.clientY };
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      // The tap that would have followed must not also fire.
      suppressClick.current = true;
      if (navigator.vibrate) navigator.vibrate(8);
      openMenu();
    }, LONG_PRESS_MS);
  };

  const movePress = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = pressStart.current;
    if (!start || pressTimer.current === null) return;
    if (
      Math.abs(event.clientX - start.x) > PRESS_SLOP_PX ||
      Math.abs(event.clientY - start.y) > PRESS_SLOP_PX
    ) {
      cancelPress();
    }
  };

  return (
    <div
      className={`flex w-full min-w-0 flex-col ${mine ? "items-end self-end" : "items-start self-start"}`}
      onClickCapture={(event) => {
        // A long press or right click opened the menu: the click underneath
        // must not also open the preview or follow a link.
        if (suppressClick.current) {
          suppressClick.current = false;
          event.preventDefault();
          event.stopPropagation();
        }
      }}
      onContextMenu={(event) => {
        if (!onAction) return;
        event.preventDefault();
        suppressClick.current = true;
        openMenu();
      }}
      onPointerCancel={cancelPress}
      onPointerDown={startPress}
      onPointerLeave={cancelPress}
      onPointerMove={movePress}
      onPointerUp={cancelPress}
      ref={wrapRef}
    >
      {deleted ? (
        /* A tombstone: the words are gone from everyone's record, and both
           sides see the same quiet mark in their place. */
        <div className="flex items-center gap-1.5 rounded-[1.35rem] bg-surface-secondary/60 px-3.5 py-2.5 text-[13px] text-muted italic">
          <Icon className="shrink-0 opacity-70" name="xCircle" size={14} />
          Message deleted
        </div>
      ) : (
        <>
          {/* Photographs stand on their own — the image is the object. */}
          {images.length > 0 ? (
            <div
              className={`motion-safe:animate-chat-in flex max-w-full flex-wrap gap-1.5 ${mine ? "justify-end" : "justify-start"}`}
            >
              {images.map((attachment) => (
                <ImageView attachment={attachment} key={attachment.key} onOpen={setPreview} />
              ))}
            </div>
          ) : null}

          {/* A payment request stands on its own — the card is the object. */}
          {payment ? <PaymentRequestCard mine={mine} payment={payment} /> : null}

          {/* Words and non-image media keep the bubble, exactly as it was. */}
          {hasBubble ? (
            <div
              className={`motion-safe:animate-chat-in flex min-w-0 max-w-full flex-col gap-2 px-4 py-2.5 text-[15px] leading-[1.55] ${
                mine
                  ? `bg-accent text-accent-foreground ${tail ? "rounded-[1.35rem] rounded-br-md" : "rounded-[1.35rem]"}`
                  : `bg-surface text-foreground shadow-elev-1 ${tail ? "rounded-[1.35rem] rounded-bl-md" : "rounded-[1.35rem]"}`
              } ${isPending(message) && message.status === "failed" ? "ring-1 ring-danger/40" : ""}`}
              style={{ maxWidth: "min(100%, 32rem)" }}
            >
              {others.map((attachment) => (
                <AttachmentView attachment={attachment} key={attachment.key} />
              ))}
              {hasText ? <p className="wrap-anywhere whitespace-pre-wrap">{message.body}</p> : null}
            </div>
          ) : null}
        </>
      )}

      {showStatus ? (
        mine ? (
          <MessageStatus
            createdAt={message.createdAt}
            edited={edited}
            onRetry={isPending(message) && onRetry ? () => onRetry(message.key) : undefined}
            readAt={message.readAt}
            status={isPending(message) ? (message.status ?? "sending") : "sent"}
          />
        ) : (
          <span className="flex items-center gap-1.5 px-1.5 pt-0.5 text-[11px] text-muted">
            <span>{formatClock(message.createdAt)}</span>
            {edited ? (
              <>
                <span aria-hidden="true">·</span>
                <span>Edited</span>
              </>
            ) : null}
          </span>
        )
      ) : null}

      {/* The photograph, opened. */}
      {preview ? (
        <ImagePreview alt={preview.fileName} onClose={() => setPreview(null)} src={preview.url} />
      ) : null}

      {/* What a long press reveals. */}
      {menuAnchor && onAction ? (
        <MessageActionsMenu
          anchor={menuAnchor}
          message={message}
          mine={mine}
          onAction={onAction}
          onClose={() => setMenuAnchor(null)}
        />
      ) : null}
    </div>
  );
}
