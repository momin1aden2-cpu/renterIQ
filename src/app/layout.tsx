import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "RenterIQ — Smart Renting Assistant",
  description: "AI-assisted renting tools for Australian tenants",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#1B50C8",
};

export default function RootLayout() {
  redirect("/app");
}
