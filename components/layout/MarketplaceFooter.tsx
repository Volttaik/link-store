import { Link } from "@heroui/react/link";

import { BrandMark, Wordmark } from "@/components/ui/Icon";
import { SvgBackdrop } from "@/components/visual/Atmosphere";
import { MARKETPLACE_SECTIONS } from "@/lib/catalog";

const LINK_GROUPS = [
  {
    title: "Sell",
    links: [
      { href: "/sign-up", label: "Create a storefront" },
      { href: "/sign-in", label: "Seller login" },
      { href: "/workspace", label: "Workspace" },
    ],
  },
  {
    title: "Buy",
    links: [
      { href: "/products", label: "Marketplace" },
      { href: "/stores", label: "Stores" },
      { href: "/orders", label: "Track an order" },
      { href: "/search", label: "Search" },
    ],
  },
];

export function MarketplaceFooter() {
  const year = new Date().getFullYear();

  return (
    /*
     * The footer closes the page in the same neutral space it opened in: the
     * three-orb motif drifting behind the links in the accent trio — never a
     * separator line, never line work. The colour lives in the orbs; the
     * surfaces stay quiet.
     */
    <footer className="relative isolate mt-24 overflow-hidden">
      <SvgBackdrop className="-z-10" variant="hero" />
      <div className="mx-auto w-full max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-2 text-foreground">
              <BrandMark />
              <Wordmark />
            </div>
            <p className="mt-4 max-w-xs text-[13px] leading-relaxed text-muted">
              One link. Everything you sell. Products, food, services, events, tickets and digital
              files from a single storefront.
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium tracking-wider text-muted uppercase">Categories</p>
            <ul className="mt-4 flex flex-col gap-2.5">
              {MARKETPLACE_SECTIONS.slice(0, 5).map((section) => (
                <li key={section.slug}>
                  <Link
                    href={`/${section.slug}`}
                    className="text-[13px] text-muted no-underline hover:text-foreground"
                  >
                    {section.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {LINK_GROUPS.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                {group.title}
              </p>
              <ul className="mt-4 flex flex-col gap-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-[13px] text-muted no-underline hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Spacing alone separates the colophon; no rule, no line. */}
        <div className="mt-12 flex flex-col gap-2 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {year} LINK STORE</p>
          <p>Secure payments powered by Paystack</p>
        </div>
      </div>
    </footer>
  );
}
