"use client";

/**
 * The composer.
 *
 * Three deliberate controls in one cohesive row: the attach button, a large
 * curved text-entry area, and the send button — an independent control that
 * sits *beside* the entry, never inside it. The entry is substantial: roomy
 * padding, comfortable type, and it grows with the words until it hands over to
 * its own scroll. Its scale belongs to the platform's control language, on
 * every screen size.
 *
 * Adding media is seamless: pick it, watch it arrive in the tray above, take it
 * out again if it is wrong, and it travels into the conversation with the
 * message. Uploads report their real progress; a failed upload fails alone and
 * can be retried alone. Nothing here ever blocks the conversation — and when a
 * message is sent, it is simply gone from here and down there at once.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Icon } from "@/components/ui/Icon";
import {
  FILE_ACCEPT_ATTRIBUTE,
  MEDIA_ACCEPT_ATTRIBUTE,
  formatSize,
  isImage,
  maxBytesFor,
} from "@/lib/chat/media";
import type { ChatAttachment } from "@/lib/chat/types";

const MAX_ATTACHMENTS = 6;

type UploadingFile = {
  localId: string;
  fileName: string;
  contentType: string;
  size: number;
  /** A local preview for images; revoked once the entry is gone. */
  previewUrl: string | null;
  progress: number;
  status: "uploading" | "done" | "failed";
  /** Set only once the backend has confirmed the upload. */
  attachment: ChatAttachment | null;
  file: File;
};

/* ---------------------------------------------------------------------- */
/* Attachment tray                                                          */
/* ---------------------------------------------------------------------- */

function AttachmentTray({
  uploads,
  onRemove,
  onRetry,
}: {
  uploads: UploadingFile[];
  onRemove: (localId: string) => void;
  onRetry: (localId: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2 px-1 pb-2">
      {uploads.map((upload) => (
        <div
          className="motion-safe:animate-chat-pop relative flex w-[6.75rem] flex-col gap-1 rounded-2xl bg-surface p-1.5 shadow-elev-1"
          key={upload.localId}
        >
          <div className="flex h-16 w-full items-center justify-center overflow-hidden rounded-xl bg-surface-secondary">
            {upload.previewUrl ? (
              <img alt="" className="h-full w-full object-cover" src={upload.previewUrl} />
            ) : (
              <Icon name="file" size={18} className="text-muted" />
            )}
          </div>
          <p className="truncate px-0.5 text-[10.5px] font-medium text-muted">{upload.fileName}</p>

          {upload.status === "uploading" ? (
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-secondary">
              <div
                className="h-full rounded-full bg-accent transition-[width] duration-200"
                style={{ width: `${upload.progress}%` }}
              />
            </div>
          ) : upload.status === "failed" ? (
            <div className="flex items-center gap-1.5 px-0.5 text-[10.5px]">
              <span className="font-medium text-danger">Failed</span>
              <button
                className="font-semibold text-danger underline-offset-2 hover:underline"
                onClick={() => onRetry(upload.localId)}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : (
            <p className="px-0.5 text-[10.5px] text-success">{formatSize(upload.size)}</p>
          )}

          <button
            aria-label={`Remove ${upload.fileName}`}
            className="absolute -top-1 -right-1 flex size-5 items-center justify-center rounded-full bg-surface text-muted shadow-elev-1 transition-colors hover:text-foreground"
            onClick={() => onRemove(upload.localId)}
            type="button"
          >
            <Icon name="x" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------------- */
/* Composer                                                                 */
/* ---------------------------------------------------------------------- */

export function ChatComposer({
  counterpartName,
  onSend,
  editing,
  onEditConfirm,
  onEditCancel,
  canRequestPayment = false,
  onRequestPayment,
}: {
  counterpartName: string;
  /** Delivers the words and confirmed media — the conversation owns what happens next. */
  onSend: (body: string, attachments: ChatAttachment[]) => void;
  /** A message being edited — the composer becomes its editor until it is settled. */
  editing?: { key: string; body: string } | null;
  /** Confirms the change — the conversation updates the message in place. */
  onEditConfirm?: (body: string) => void;
  onEditCancel?: () => void;
  /** The seller's side of the thread can send a payment request. */
  canRequestPayment?: boolean;
  /** Opens the small sheet where the agreed amount is entered. */
  onRequestPayment?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [uploads, setUploads] = useState<UploadingFile[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  /** The uploads as they stand right now — for cleanup that must not go stale. */
  const uploadsRef = useRef<UploadingFile[]>([]);
  uploadsRef.current = uploads;
  /** The in-flight requests, so a removed upload is truly cancelled. */
  const requestsRef = useRef(new Map<string, XMLHttpRequest>());

  // Editing borrows the composer: the message's words move in here, ready to
  // be changed, and one confirm moves them back — the same entry, the same
  // send control, no second form.
  useEffect(() => {
    if (!editing) return;
    setDraft(editing.body);
    setNote(null);
    const el = textareaRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editing]);

  // The entry grows with the words — but only to a point; after that it scrolls
  // inside itself and the composer keeps its shape.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 152)}px`;
  }, [draft]);

  // Release local previews when they are no longer needed — including the
  // ones still on the tray when the composer goes away.
  useEffect(
    () => () => {
      for (const upload of uploadsRef.current) {
        if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
      }
      for (const request of requestsRef.current.values()) request.abort();
      requestsRef.current.clear();
    },
    [],
  );

  // The attach menu is a light popover: it closes on a click anywhere else.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [menuOpen]);

  /* -------------------------------------------------------------------- */
  /* Uploading                                                             */
  /* -------------------------------------------------------------------- */

  function startUpload(file: File) {
    const localId = `up-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const contentType = (file.type || "application/octet-stream").toLowerCase();
    const entry: UploadingFile = {
      localId,
      fileName: file.name,
      contentType,
      size: file.size,
      previewUrl: isImage(contentType) ? URL.createObjectURL(file) : null,
      progress: 0,
      status: "uploading",
      attachment: null,
      file,
    };
    setUploads((previous) => [...previous, entry]);

    const body = new FormData();
    body.append("file", file);
    body.append("kind", isImage(contentType) ? "image" : "file");
    body.append("folder", "messages");
    body.append("purpose", "message");
    body.append("visibility", "public");

    const request = new XMLHttpRequest();
    requestsRef.current.set(localId, request);
    request.open("POST", "/api/uploads");

    request.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      setUploads((previous) =>
        previous.map((upload) =>
          upload.localId === localId ? { ...upload, progress: percent } : upload,
        ),
      );
    };

    request.onload = () => {
      requestsRef.current.delete(localId);
      let parsed: { key?: string; url?: string } = {};
      try {
        parsed = JSON.parse(request.responseText) as typeof parsed;
      } catch {
        // Handled below as a failed upload.
      }

      if (request.status >= 200 && request.status < 300 && parsed.key) {
        setUploads((previous) =>
          previous.map((upload) =>
            upload.localId === localId
              ? {
                  ...upload,
                  status: "done",
                  progress: 100,
                  attachment: {
                    key: parsed.key!,
                    // The server re-resolves the URL on send; this one comes
                    // from the confirmed upload and is for preview only.
                    url: parsed.url ?? "",
                    fileName: file.name.slice(0, 200),
                    contentType,
                    size: file.size,
                  },
                }
              : upload,
          ),
        );
      } else {
        markFailed(localId);
      }
    };

    request.onerror = () => {
      requestsRef.current.delete(localId);
      markFailed(localId);
    };
    request.send(body);
  }

  function markFailed(localId: string) {
    setUploads((previous) =>
      previous.map((upload) => (upload.localId === localId ? { ...upload, status: "failed" } : upload)),
    );
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;

    const room = MAX_ATTACHMENTS - uploads.length;
    if (room <= 0) {
      setNote(`You can attach up to ${MAX_ATTACHMENTS} files at a time.`);
      return;
    }

    for (const file of Array.from(files).slice(0, room)) {
      const limit = maxBytesFor(file.type);
      if (file.size > limit) {
        setNote(`${file.name} is larger than ${Math.round(limit / (1024 * 1024))} MB.`);
        continue;
      }
      startUpload(file);
    }
  }

  function removeUpload(localId: string) {
    // A cancel is a real cancel: the request is aborted, not left to finish
    // into storage after the user took the file back.
    requestsRef.current.get(localId)?.abort();
    requestsRef.current.delete(localId);
    setUploads((previous) => {
      const target = previous.find((upload) => upload.localId === localId);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return previous.filter((upload) => upload.localId !== localId);
    });
  }

  function retryUpload(localId: string) {
    const target = uploads.find((upload) => upload.localId === localId);
    if (!target) return;
    removeUpload(localId);
    startUpload(target.file);
  }

  /* -------------------------------------------------------------------- */
  /* Sending                                                               */
  /* -------------------------------------------------------------------- */

  const readyAttachments = uploads
    .filter((upload) => upload.status === "done" && upload.attachment)
    .map((upload) => upload.attachment!);
  const canSend = draft.trim().length > 0 || readyAttachments.length > 0;

  function send() {
    if (editing) {
      // An edit settles the same message it started from — never a copy.
      const body = draft.trim();
      if (!body) return;
      setDraft("");
      setNote(null);
      onEditConfirm?.(body);
      return;
    }

    if (!canSend) return;

    const body = draft.trim();
    setDraft("");
    setNote(null);
    onSend(body, readyAttachments);

    // Only the ones that travelled go; anything still uploading stays to go
    // with the next message.
    setUploads((previous) =>
      previous.filter((upload) => {
        if (upload.status === "done" && upload.attachment) {
          if (upload.previewUrl) URL.revokeObjectURL(upload.previewUrl);
          return false;
        }
        return true;
      }),
    );
    if (textareaRef.current) textareaRef.current.style.height = "auto";
  }

  return (
    /* `data-chat-composer` marks this as the region the keyboard docks to:
       while the keyboard is open, the home-indicator inset below is dropped
       (see `globals.css`), so the composer sits directly on the keyboard with
       no gap. The rest of the time the inset keeps it clear of the home
       indicator. */
    <div
      className="flex shrink-0 flex-col bg-background px-2.5 pt-1.5 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      data-chat-composer
    >
      {editing ? (
        <div className="flex items-center gap-2 rounded-2xl bg-surface-secondary/70 px-3 py-2">
          <Icon className="shrink-0 text-accent" name="edit" size={14} />
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold tracking-[0.06em] text-accent uppercase">
              Editing message
            </p>
            <p className="truncate text-[11.5px] text-muted">{editing.body}</p>
          </div>
          <button
            aria-label="Cancel editing"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface hover:text-foreground motion-safe:active:scale-95"
            onClick={() => {
              setDraft("");
              setNote(null);
              onEditCancel?.();
            }}
            type="button"
          >
            <Icon name="x" size={13} />
          </button>
        </div>
      ) : null}

      {note ? (
        <p className="px-2 pb-1.5 text-[11.5px] font-medium text-danger" role="status">
          {note}
        </p>
      ) : null}

      {uploads.length > 0 ? (
        <AttachmentTray uploads={uploads} onRemove={removeUpload} onRetry={retryUpload} />
      ) : null}

      {/* One cohesive row of three controls: attach, the curved entry, and the
          send button — a separate control beside the entry, never inside it. */}
      <div className="flex items-end gap-1.5 sm:gap-2">
        <div className="relative shrink-0" ref={menuRef}>
          <button
            aria-label="Add photos or files"
            className="flex size-10 items-center justify-center rounded-full bg-surface text-muted shadow-elev-1 transition-all hover:text-foreground motion-safe:active:scale-95 sm:size-11"
            onClick={() => setMenuOpen((open) => !open)}
            type="button"
          >
            <Icon
              className={`transition-transform duration-200 ${menuOpen ? "rotate-45" : ""}`}
              name="plus"
              size={20}
            />
          </button>

          {menuOpen ? (
            <div className="motion-safe:animate-chat-pop absolute bottom-12 left-0 z-20 w-52 overflow-hidden rounded-2xl bg-surface p-1 shadow-elev-float">
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary"
                onClick={() => {
                  setMenuOpen(false);
                  mediaInputRef.current?.click();
                }}
                type="button"
              >
                <Icon className="text-muted" name="image" size={16} />
                Photos & video
              </button>
              <button
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary"
                onClick={() => {
                  setMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                type="button"
              >
                <Icon className="text-muted" name="file" size={16} />
                Documents & files
              </button>
              {canRequestPayment && onRequestPayment ? (
                <button
                  className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:bg-surface-secondary"
                  onClick={() => {
                    setMenuOpen(false);
                    onRequestPayment();
                  }}
                  type="button"
                >
                  <Icon className="text-muted" name="wallet" size={16} />
                  Send payment
                </button>
              ) : null}
            </div>
          ) : null}

          <input
            accept={MEDIA_ACCEPT_ATTRIBUTE}
            className="hidden"
            multiple
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
            ref={mediaInputRef}
            type="file"
          />
          <input
            accept={FILE_ACCEPT_ATTRIBUTE}
            className="hidden"
            multiple
            onChange={(event) => {
              handleFiles(event.target.files);
              event.target.value = "";
            }}
            ref={fileInputRef}
            type="file"
          />
        </div>

        {/* The text entry: its own large curved object, roomy and readable. */}
        <div className="flex min-h-12 flex-1 items-end rounded-[1.45rem] bg-surface px-3.5 py-2.5 shadow-elev-2 transition-shadow duration-200 focus-within:shadow-elev-3 sm:min-h-[3.35rem] sm:px-4">
          <textarea
            aria-label={`Message ${counterpartName}`}
            className="max-h-[152px] min-h-[1.75rem] w-full resize-none bg-transparent text-[15px] leading-[1.5] text-foreground outline-none placeholder:text-muted"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send();
              }
            }}
            placeholder={`Message ${counterpartName}…`}
            ref={textareaRef}
            rows={1}
            value={draft}
          />
        </div>

        {/* Send — an independent, unmistakable control beside the entry. */}
        <button
          aria-label={editing ? "Confirm edit" : "Send message"}
          className={`flex size-10 shrink-0 items-center justify-center rounded-full transition-colors duration-200 motion-safe:active:scale-95 sm:size-11 ${
            canSend
              ? "bg-accent text-accent-foreground shadow-elev-1"
              : "bg-surface text-muted/50 shadow-elev-1"
          }`}
          disabled={!canSend}
          onClick={send}
          type="button"
        >
          <Icon name="send" size={19} />
        </button>
      </div>
    </div>
  );
}
