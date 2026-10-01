import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rush Cart", short_name: "Rush Cart",
    description: "Discover products. Shop independent stores.",
    start_url: "/", scope: "/", display: "standalone",
    background_color: "#fafafd", theme_color: "#554695",
    icons: [
      { src: "/brand/rush-cart-logo.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/rush-cart-icon.png", sizes: "192x192", type: "image/png", purpose: "any" },
    ],
  };
}
