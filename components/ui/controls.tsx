"use client";

import { Alert, AlertDialog, Button, useOverlayState } from "@heroui/react";

import { OrbLoader } from "@/components/visual/OrbLoader";

import { Icon } from "@/components/ui/Icon";
import { buttonVariants } from "@heroui/styles";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

/** HeroUI v3 button variants, kept in one place for consistent use. */
export type ButtonVariant =
  | "primary"
  | "secondary"
  | "tertiary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-soft";

export type ButtonSize = "sm" | "md" | "lg";

/** Submit button that reflects the enclosing form's pending state. */
export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isDisabled = false,
}: {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isDisabled?: boolean;
}) {
  const { pending } = useFormStatus();

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      fullWidth={fullWidth}
      isPending={pending}
      isDisabled={isDisabled || pending}
    >
      {children}
    </Button>
  );
}

/**
 * A button that navigates, and says so while it does.
 *
 * The push runs inside a transition, so `isPending` stays true until the
 * destination has rendered — the spinner belongs to the button the user pressed,
 * not to a global overlay, and the control keeps its width throughout so nothing
 * around it shifts.
 */
export function NavButton({
  href,
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isIconOnly = false,
  isDisabled = false,
  className,
  ariaLabel,
  onNavigate,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isIconOnly?: boolean;
  isDisabled?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Runs before the push — used to close a drawer the button lives in. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      isIconOnly={isIconOnly}
      aria-label={ariaLabel}
      className={className}
      fullWidth={fullWidth}
      isDisabled={isDisabled || pending}
      isPending={pending}
      size={size}
      variant={variant}
      onPress={() => {
        onNavigate?.();
        startTransition(() => router.push(href));
      }}
    >
      {children}
    </Button>
  );
}

/**
 * A navigation action that looks exactly like a HeroUI button.
 *
 * HeroUI v3 buttons are not polymorphic — there is no `as` prop — and nesting a
 * `<button>` inside an `<a>` is invalid HTML. HeroUI's documented answer is to
 * style the routing link with its own `buttonVariants()`, which is what this
 * does, so the control inherits the real button classes, states and sizes.
 */
export function ButtonLink({
  href,
  children,
  variant = "primary",
  size = "md",
  fullWidth = false,
  isDisabled = false,
  className,
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  isDisabled?: boolean;
  className?: string;
}) {
  return (
    <NextLink
      aria-disabled={isDisabled || undefined}
      className={`${buttonVariants({ variant, size, fullWidth })} ${
        isDisabled ? "pointer-events-none opacity-50" : ""
      } ${className ?? ""}`}
      href={href}
      tabIndex={isDisabled ? -1 : undefined}
    >
      {children}
    </NextLink>
  );
}

/** Renders the error or success message produced by a form action. */
export function FormAlert({
  error,
  message,
  issues,
}: {
  error?: string | null;
  message?: string | null;
  issues?: string[] | null;
}) {
  const router = useRouter();

  if (!error && !message) return null;

  const isError = Boolean(error);

  return (
    <Alert status={isError ? "danger" : "success"}>
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{error ?? message ?? ""}</Alert.Title>
        {issues && issues.length > 0 ? (
          <Alert.Description>
            <ul className="mt-1 list-inside list-disc space-y-0.5">
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </Alert.Description>
        ) : null}
      </Alert.Content>
      {!isError ? (
        <Button size="sm" variant="tertiary" onPress={() => router.refresh()}>
          Refresh
        </Button>
      ) : null}
    </Alert>
  );
}

/**
 * Declarative server-action button.
 *
 * When `confirm` is present the action runs only after the user approves a
 * HeroUI dialog — never a browser `confirm()`.
 */
export function ActionButton({
  action,
  children,
  variant = "tertiary",
  size = "sm",
  confirm,
  confirmLabel = "Delete",
  isDisabled = false,
  fullWidth = false,
}: {
  action: () => Promise<unknown> | unknown;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  confirm?: string;
  confirmLabel?: string;
  isDisabled?: boolean;
  fullWidth?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  const dialog = useOverlayState();

  async function run() {
    setFailed(false);
    try {
      await action();
      if (typeof window !== "undefined" && confirm) window.location.reload();
      else router.refresh();
    } catch {
      setFailed(true);
    }
  }

  const button = (
    <Button
      variant={variant}
      size={size}
      isDisabled={isDisabled}
      isPending={pending}
      fullWidth={fullWidth}
      onPress={confirm ? () => dialog.open() : () => startTransition(run)}
    >
      {children}
    </Button>
  );

  if (!confirm) {
    return (
      <span className="inline-flex flex-col items-start gap-1">
        {button}
        {failed ? <span className="text-xs text-danger">That action failed. Try again.</span> : null}
      </span>
    );
  }

  return (
    <>
      {button}
      <ConfirmDialog
        confirmLabel={confirmLabel}
        description={confirm}
        isOpen={dialog.isOpen}
        isPending={pending}
        title={`${confirmLabel} this item?`}
        onConfirm={() => startTransition(run)}
        onOpenChange={dialog.setOpen}
      />
    </>
  );
}

/**
 * A destructive confirmation.
 *
 * Built on HeroUI's `AlertDialog`, which is the component HeroUI provides for
 * exactly this: a decision the user cannot dismiss by clicking away, with an
 * explicit confirm and cancel. Never a browser `confirm()`.
 */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  status = "danger",
  isPending = false,
  onConfirm,
}: {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  status?: "default" | "accent" | "success" | "warning" | "danger";
  isPending?: boolean;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <AlertDialog.Backdrop>
        <AlertDialog.Container placement="center">
          <AlertDialog.Dialog className="sm:max-w-[400px]">
            <AlertDialog.Header>
              <AlertDialog.Icon status={status} />
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>

            <AlertDialog.Body>
              <div className="text-sm text-muted">{description}</div>
            </AlertDialog.Body>

            <AlertDialog.Footer>
              <Button slot="close" variant="tertiary">
                {cancelLabel}
              </Button>
              <Button
                isPending={isPending}
                slot="close"
                variant={status === "danger" ? "danger" : "primary"}
                onPress={onConfirm}
              >
                {confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );
}

/** Full-section loading state — the three orbs, breathing. */
export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-muted">
      <OrbLoader className="h-5 w-[3.75rem]" />
      <p className="text-[13px]">{label}</p>
    </div>
  );
}

/**
 * Copy a shareable link.
 *
 * Used where a seller has something to hand out — an event page customers can
 * buy from, a storefront — and the value of the link is that it is short enough
 * to paste anywhere.
 */
export function CopyLinkButton({
  url,
  label = "Copy link",
  copiedLabel = "Link copied",
  variant = "secondary",
  size = "sm",
}: {
  url: string;
  label?: string;
  copiedLabel?: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      // A path is only useful once it is an address somebody can open.
      const absolute = url.startsWith("/") ? `${window.location.origin}${url}` : url;
      await navigator.clipboard.writeText(absolute);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Button size={size} variant={variant} onPress={() => void copy()}>
      <Icon name={copied ? "check" : "link"} size={15} />
      {copied ? copiedLabel : label}
    </Button>
  );
}

/**
 * A bare, centred spinner for a content area that is still loading.
 *
 * Deliberately silent: no label, no card, no layout of its own. It is what
 * fills the dynamic region of a persistent shell, so the navigation around it
 * never disappears and the page never blanks or flashes.
 */
export function ContentSpinner({ className = "" }: { className?: string }) {
  return (
    <div
      aria-label="Loading"
      className={`flex items-center justify-center ${className}`}
      role="status"
    >
      {/* The three orbs, breathing — the platform's own loading identity. */}
      <OrbLoader className="h-5 w-[3.75rem]" />
    </div>
  );
}
