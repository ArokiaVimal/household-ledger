import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Personal Finance App",
    short_name: "Finance",
    description: "Track your own spending, then split with your partner and friends",
    start_url: "/",
    display: "standalone",
    background_color: "#f3f2f8",
    theme_color: "#5b3fd1",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
