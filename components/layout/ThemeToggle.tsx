"use client";

import { Button, Tooltip } from "@heroui/react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Icon } from "@/components/ui/Icon";

/**
 * Light/dark switch.
 *
 * Nothing that depends on the active theme renders until mount, so server and
 * client markup agree — the theme is not known until hydration. That has to
 * cover the label and tooltip too, not just the icon: `resolvedTheme` is
 * undefined on the server, so a label derived from it directly would render
 * "Switch to dark mode" in the HTML and "Switch to light mode" on a dark-theme
 * client, which React reports as a hydration mismatch.
 */
export function ThemeToggle({ size = "md" as const }: { size?: "sm" | "md" | "lg" }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Only trust the theme once mounted, so the first client render matches the
  // server's (both see `isDark === false`).
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Tooltip delay={200}>
      <Button
        isIconOnly
        size={size}
        variant="ghost"
        aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
        onPress={() => setTheme(isDark ? "light" : "dark")}
      >
        {mounted ? <Icon name={isDark ? "sun" : "moon"} size={16} /> : <span className="size-4" />}
      </Button>
      <Tooltip.Content>{isDark ? "Light mode" : "Dark mode"}</Tooltip.Content>
    </Tooltip>
  );
}
