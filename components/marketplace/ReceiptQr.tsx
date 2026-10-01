import { receiptQrSvg } from "@/lib/receipts";

/**
 * A paid order's receipt QR code, rendered on the server.
 *
 * It carries only the order's opaque receipt code — never a name, an address or
 * an amount, because a QR is a public object. Scanning it opens the seller's
 * verification view for *this* order and nothing else.
 */
export async function ReceiptQr({
  code,
  className = "",
  size = 320,
}: {
  code: string;
  className?: string;
  size?: number;
}) {
  const svg = await receiptQrSvg(code, size);

  return (
    <div
      aria-label={`Receipt verification code ${code}`}
      className={`aspect-square w-full overflow-hidden rounded-2xl bg-white p-2.5 shadow-sm [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
    />
  );
}
