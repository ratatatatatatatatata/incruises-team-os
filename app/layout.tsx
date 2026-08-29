import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from "./brand";
import { PwaRegister } from "./pwa-register";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = PRODUCT_NAME;
  const description = PRODUCT_DESCRIPTION;

  return {
    metadataBase: base,
    title: { default: title, template: `%s · ${title}` },
    description,
    applicationName: title,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false, noimageindex: true },
    },
    icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
    openGraph: {
      type: "website",
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#071426",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="mn">
      <body>
        {children}
        <PwaRegister />
      </body>
    </html>
  );
}
