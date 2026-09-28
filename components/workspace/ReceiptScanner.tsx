"use client";

/**
 * The counter.
 *
 * A seller scans a customer's receipt QR (or types the code) and sees exactly
 * what the order is: whose it is, what is in it, whether it was paid, and
 * whether it has already been handed over. The browser decides nothing — every
 * answer comes from the server, scoped to this seller's own store.
 *
 * For pickup orders this is also the handover: one tap records collection, and
 * the shipment's terminal state makes a second collection impossible.
 */

import { Button, Input, Label, TextField } from "@heroui/react";
import { useEffect, useRef, useState, useTransition } from "react";

import {
  completePickupAction,
  verifyReceiptAction,
} from "@/app/actions/orders-admin";
import { Icon } from "@/components/ui/Icon";
import { formatDateTime, humanize } from "@/lib/format";
import { formatMoney } from "@/lib/money";

type ReceiptVerification = {
  ok: boolean;
  reason?: "empty" | "not_found";
  message: string;
  orderNumber: string | null;
  placedAt: string | null;
  paidAt: string | null;
  buyerName: string | null;
  buyerContact: string | null;
  items: Array<{ title: string; quantity: number; total: number; currency: string }>;
  total: number;
  currency: string;
  paymentStatus: string;
  orderStatus: string;
  fulfilmentMethod: string;
  shipmentStatus: string | null;
  completedAt: string | null;
  canCompletePickup: boolean;
  orderId: string | null;
  shipmentId: string | null;
};

type BarcodeDetectorLike = {
  detect: (source: CanvasImageSource) => Promise<Array<{ rawValue: string }>>;
};

type DetectorConstructor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

export function ReceiptScanner({ initialCode = "" }: { initialCode?: string }) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<ReceiptVerification | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [handover, setHandover] = useState<{ ok: boolean; text: string } | null>(null);
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
      setError("Enter or scan a receipt code.");
      inputRef.current?.focus();
      return;
    }

    setError(null);
    setHandover(null);
    startTransition(async () => {
      const response = await verifyReceiptAction({ code: value });
      if (!response.ok) {
        setError(response.error);
        return;
      }

      setResult(response.data);
      setCode("");
      inputRef.current?.focus();
    });
  }

  /** Hand a pickup order over — once. The database refuses the second time. */
  function collect() {
    const shipmentId = result?.shipmentId;
    const orderId = result?.orderId;
    if (!shipmentId || !orderId || !result) return;

    const orderNumber = result.orderNumber;
    setHandover(null);
    startTransition(async () => {
      const response = await completePickupAction({ shipmentId, orderId });
      if (!response.ok) {
        setHandover({ ok: false, text: response.error ?? "The pickup could not be recorded." });
        return;
      }

      setHandover({ ok: true, text: response.data.message });

      // Re-read the order so this panel reflects the closed pickup immediately.
      const fresh = await verifyReceiptAction({ code: orderNumber ?? "" });
      if (fresh.ok) setResult(fresh.data);
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
        "This browser cannot scan codes. Type the receipt code instead. Verification works the same way.",
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
      setCameraError("Camera access was blocked. Type the receipt code instead.");
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

        // One physical receipt must not fire repeatedly while it is held up.
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

  const paid = result?.paymentStatus === "paid";

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
            <Label>Receipt code</Label>
            <Input
              autoComplete="off"
              autoFocus
              className="font-mono text-base uppercase"
              placeholder="RC-XXXXXXXXXXXXXXXX"
              ref={inputRef}
            />
          </TextField>
        </div>

        <div className="flex gap-2">
          <Button isPending={pending} type="submit" variant="primary">
            Verify receipt
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
            Point the camera at the receipt&apos;s QR code.
          </p>
        </div>
      ) : null}

      {result && result.reason !== "empty" ? (
        <div
          aria-live="polite"
          className={
            "flex flex-col gap-4 rounded-2xl border p-4 shadow-sm " +
            (result.ok && paid
              ? "border-success/40 bg-success/10"
              : "border-danger/40 bg-danger/10")
          }
          role="status"
        >
          <div className="flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={
                "flex size-12 shrink-0 items-center justify-center rounded-full " +
                (result.ok && paid ? "bg-success text-white" : "bg-danger text-white")
              }
            >
              <Icon name={result.ok && paid ? "check" : "x"} size={26} />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={
                  "text-xl leading-tight font-semibold tracking-tight " +
                  (result.ok && paid ? "text-success" : "text-danger")
                }
              >
                {result.ok
                  ? paid
                    ? "Legitimate Order"
                    : "Order Not Paid"
                  : "Receipt Not Found"}
              </p>
              <p className="mt-0.5 text-[13px] text-muted">{result.message}</p>
            </div>
          </div>

          {result.ok ? (
            <>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-surface/70 p-3 text-[13px] sm:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    Order
                  </dt>
                  <dd className="truncate font-mono font-semibold">{result.orderNumber}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    Buyer
                  </dt>
                  <dd className="truncate font-medium">{result.buyerName ?? "Not recorded"}</dd>
                  <dd className="truncate text-xs text-muted">{result.buyerContact}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    Amount
                  </dt>
                  <dd className="truncate font-medium">
                    {formatMoney(result.total, result.currency)}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[10px] font-medium tracking-wider text-muted uppercase">
                    Placed
                  </dt>
                  <dd className="truncate font-medium">
                    {result.placedAt ? formatDateTime(result.placedAt) : "—"}
                  </dd>
                </div>
              </dl>

              <div className="space-y-1.5 rounded-xl bg-surface/70 p-3 text-[13px]">
                {result.items.map((item, index) => (
                  <div key={`${item.title}-${index}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">
                      {item.quantity} × {item.title}
                    </span>
                    <span className="shrink-0 font-medium">
                      {formatMoney(item.total, item.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="rounded-full bg-surface px-2.5 py-1 font-medium">
                  {humanize(result.fulfilmentMethod)}
                </span>
                {result.shipmentStatus ? (
                  <span className="rounded-full bg-surface px-2.5 py-1 font-medium">
                    {humanize(result.shipmentStatus.replace(/_/g, " "))}
                  </span>
                ) : null}
                <span className="rounded-full bg-surface px-2.5 py-1 font-medium capitalize">
                  {result.paymentStatus}
                </span>
                {result.completedAt ? (
                  <span className="flex items-center gap-1 text-success">
                    <Icon name="check" size={12} />
                    {result.fulfilmentMethod === "pickup" ? "Collected" : "Delivered"}{" "}
                    {formatDateTime(result.completedAt)}
                  </span>
                ) : null}
              </div>

              {result.canCompletePickup ? (
                <Button variant="primary" isPending={pending} onPress={collect} fullWidth>
                  Mark as collected
                </Button>
              ) : null}
            </>
          ) : null}

          {handover ? (
            <p className={handover.ok ? "text-sm text-success" : "text-sm text-danger"}>
              {handover.text}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
