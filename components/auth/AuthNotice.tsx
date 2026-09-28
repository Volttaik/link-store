/**
 * One inline status line.
 *
 * Every authentication state that is not "carry on" is said here — a wrong code,
 * a rate limit, a code that has gone out, a session that expired. Announced to
 * assistive technology, never a browser alert, and never the engine's raw text.
 */

import { Icon, type IconName } from "@/components/ui/Icon";

type Tone = "error" | "warning" | "info" | "success";

const TONES: Record<Tone, { icon: IconName; className: string }> = {
  error: { icon: "alert", className: "border-danger/30 bg-danger/10 text-danger" },
  warning: { icon: "alert", className: "border-warning/30 bg-warning/10 text-warning" },
  info: { icon: "info", className: "border-border bg-surface-secondary text-muted" },
  success: { icon: "checkCircle", className: "border-success/30 bg-success/10 text-success" },
};

export function AuthNotice({
  tone = "error",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  const { icon, className } = TONES[tone];

  return (
    <p
      className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed ${className}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <Icon className="mt-0.5 shrink-0" name={icon} size={14} />
      <span>{children}</span>
    </p>
  );
}
