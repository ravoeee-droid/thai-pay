import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ThaiPay",
    short_name: "ThaiPay",
    description: "PromptPay scanner with Xendit sandbox payouts",
    start_url: "/",
    display: "standalone",
    background_color: "#07100d",
    theme_color: "#07100d",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" }
    ]
  };
}
