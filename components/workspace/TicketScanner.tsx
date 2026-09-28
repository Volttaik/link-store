"use client";

import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";

import { verifyTicketAction, type TicketVerification } from "@/app/actions/listings";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime } from "@/lib/format";

/**
 * A minimal shape for the (Chromium-only, still not in the TS DOM lib) barcode
 * detection API. When it is missing the scanner falls back to typing the code —
 * the verification path itself is identical either way, because both end at the
 * same server action.
 */
type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type DetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/** What the door says when it refuses — one headline per reason. */
const REFUSAL_HEADLINES: Record<string, string> = {
  not_found: "Ticket Not Found",
  wrong_event: "Wrong Event",
  already_used: "Ticket Already Used",
  cancelled: "Ticket Cancelled",
  refunded: "Ticket Refunded",
  expired: "Ticket Expired",
  invalid: "Ticket Invalid",
  not_authorised: "Not Your Ticket",
};

/**
 * The door.
 *
 * Built for a person working a queue: one field, one big result, no scrolling
 * to find out whether a ticket is good. Every scan posts the code to the server
 * and renders whatever the server says — the browser never decides that a ticket
 * is valid, so a screenshot, a shared photo or a hand-typed code all end up in
 * the same database check.
 *
 * The camera (where the browser supports it) only reads the code. It is an
 * input method, not a verification method.
 */
export function TicketScanner({
  eventId,
  eventTitle,
}: {
  eventId: string;
  eventTitle: string;
}) {
  const [code, setCode] = useState("");
  const [result, setResult] = useState<TicketVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const detectorRef = useRef<BarcodeDetectorLike | null>(null);
  const timerRef = useRef<number | null>(null);
  const lastScanRef = useRef<{ value: string; at: number } | null>(null);

  /** Send a code to the server and show exactly what it says. */
  function verify(raw: string) {
    const value = raw.trim();
    if (!value) {
      setError("Enter or scan a ticket code.");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    startTransition(async () => {
      const response = await verifyTicketAction({ eventId, code: value });
      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response.data);
      setCode("");
      inputRef.current?.focus();
    });
  }

  function stopCamera() {
    setCameraOn(false);
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  }

  async function startCamera() {
    setCameraError(null);

    const Detector = (window as unknown as { BarcodeDetector?: DetectorConstructor })
      .BarcodeDetector;
    if (!Detector) {
      setCameraError(
        "This browser cannot scan codes. Type the ticket code instead. Verification works the same way.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      detectorRef.current = new Detector({ formats: ["qr_code"] });
      setCameraOn(true);
    } catch {
      setCameraError("Camera access was blocked. Type the ticket code instead.");
    }
  }

  // Attach the stream once the video element exists, then poll it for codes.
  useEffect(() => {
    if (!cameraOn) return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;

    video.srcObject = stream;
    void video.play().catch(() => setCameraError("The camera could not start."));

    timerRef.current = window.setInterval(async () => {
      const detector = detectorRef.current;
      if (!detector || video.readyState < 2 || pending) return;

      try {
        const codes = await detector.detect(video);
        const raw = codes[0]?.rawValue;
        if (!raw) return;

        // One physical ticket must not fire repeatedly while it is held up.
        const previous = lastScanRef.current;
        const now = Date.now();
        if (previous && previous.value === raw && now - previous.at < 4000) return;
        lastScanRef.current = { value: raw, at: now };

        verify(raw);
      } catch {
        // A frame that will not decode is normal; try the next one.
      }
    }, 400);

    return () => {
      if (timerRef.current !== null) {
        window.clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraOn, pending]);

  // Never leave the camera running behind a navigation.
  useEffect(() => stopCamera, []);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-3 rounded-2xl ls-elev-2 bg-surface p-4 shadow-sm sm:flex-row sm:items-end"
        onSubmit={(event) => {
          event.preventDefault();
          verify(code);
        }}
      >
        <div className="flex-1">
          <TextField
            isDisabled={pending}
            value={code}
            onChange={(value) => setCode(value.toUpperCase())}
          >
            <Label>Ticket code</Label>
            <Input
              autoComplete="off"
              autoFocus
              className="font-mono text-base uppercase"
              placeholder="LS-XXXXXXXX"
              ref={inputRef}
            />
          </TextField>
        </div>

        <div className="flex gap-2">
          <Button isPending={pending} type="submit" variant="primary">
            Verify ticket
          </Button>

          {cameraOn ? (
            <Button type="button" variant="secondary" onPress={stopCamera}>
              Stop camera
            </Button>
          ) : (
            <Button type="button" variant="secondary" onPress={() => void startCamera()}>
              <Icon name="qr" size={16} />
              Scan
            </Button>
          )}
        </div>
      </form>

      {error ? (
        <p className="text-[13px] text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {cameraError ? (
        <p className="text-[13px] text-muted" role="alert">
          {cameraError}
        </p>
      ) : null}

      {cameraOn ? (
        <div className="overflow-hidden rounded-2xl ls-elev-2 bg-black/90 shadow-sm">
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <video
            className="mx-auto max-h-[52vh] w-full max-w-lg object-contain"
            muted
            playsInline
            ref={videoRef}
          />
          <p className="px-4 py-2.5 text-center text-xs text-white/80">
            Point the camera at the ticket&apos;s QR code.
          </p>
        </div>
      ) : null}

      {result && result.reason !== "empty" ? (
        <div
          aria-live="polite"
          className={`flex flex-col gap-4 rounded-2xl border p-4 shadow-sm ${
            result.ok
              ? "border-success/40 bg-success/10"
              : "border-danger/40 bg-danger/10"
          }`}
          role="status"
        >
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={`flex size-12 shrink-0 items-center justify-center rounded-full ${
                result.ok ? "bg-success text-white" : "bg-danger text-white"
              }`}
            >
              <Icon name={result.ok ? "check" : "x"} size={26} />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-xl leading-tight font-semibold tracking-tight ${
                  result.ok ? "text-success" : "text-danger"
                }`}
              >
                {result.ok ? "Ticket Verified" : REFUSAL_HEADLINES[result.reason ?? ""] ?? "Ticket Not Valid"}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{result.message}</p>
            </div>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface/70 p-3 text-[13px] sm:grid-cols-4">
            <div className="min-w-0">
              <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">Code</dt>
              <dd className="truncate font-mono font-semibold">{result.code || "—"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                Holder
              </dt>
              <dd className="truncate font-medium">{result.holderName ?? "Not recorded"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">Type</dt>
              <dd className="truncate font-medium">{result.ticketType ?? "Ticket"}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                {result.ok ? "Used" : "Event"}
              </dt>
              <dd className="truncate font-medium">
                {result.ok
                  ? result.usedAt
                    ? formatDateTime(result.usedAt)
                    : "now"
                  : (result.eventTitle ?? eventTitle)}
              </dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
