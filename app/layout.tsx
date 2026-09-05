import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ThaiPay",
  description: "Scan Thai PromptPay QR codes and route sandbox payouts through Xendit.",
  applicationName: "ThaiPay",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "ThaiPay"
  }
};

export const viewport: Viewport = {
  themeColor: "#07100d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
