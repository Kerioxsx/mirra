import type { Metadata, Viewport } from "next";
import "@fontsource-variable/fraunces/full-italic.css";
import "@fontsource-variable/fraunces/full.css";
import "@fontsource-variable/inter-tight";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/auth";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: { default: "Mirra — AI fashion dresser", template: "%s · Mirra" },
  description: "Search every store, try it on a 3D avatar, and let an AI stylist build the look.",
  applicationName: "Mirra",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f0e8" },
    { media: "(prefers-color-scheme: dark)", color: "#0e0e10" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        <AuthProvider>
          <AppShell>{children}</AppShell>
        </AuthProvider>
      </body>
    </html>
  );
}
