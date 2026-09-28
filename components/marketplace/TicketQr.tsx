import { ticketQrSvg } from "@/lib/tickets";

/**
 * A purchased ticket's QR code, rendered on the server.
 *
 * The code is drawn as inline SVG (no image request, no client work, no layout
 * shift) and always sits on white, because a QR that inverts with the theme is
 * a QR that fails to scan at the door. It carries only the ticket's opaque code
 * — verification happens against the database, never in the browser.
 */
export async function TicketQr({
  code,
  className = "",
  size = 320,
}: {
  code: string;
  className?: string;
  size?: number;
}) {
  const svg = await ticketQrSvg(code, size);

  return (
    <div
      aria-label={`QR code for ticket ${code}`}
      className={`aspect-square w-full overflow-hidden rounded-2xl bg-white p-2.5 shadow-sm [&>svg]:h-full [&>svg]:w-full ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
      role="img"
    />
  );
}
