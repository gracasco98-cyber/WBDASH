import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { PeriodProvider } from "@/context/PeriodContext";
import { AmazonAccountProvider } from "@/context/AmazonAccountContext";
import { MarketplaceFilterProvider } from "@/context/MarketplaceFilterContext";
import ChatWidget from "@/components/ChatWidget";

export const metadata: Metadata = {
  title: "My Dashboard — Sales Dashboard",
  description: "Shopify multi-marketplace dashboard",
  icons: { icon: "/favicon.ico" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" data-theme="dark">
      <head>
        {/* Apply saved theme before first paint to prevent flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-w-0 w-full">
        <ThemeProvider>
          <AuthProvider>
            <AmazonAccountProvider>
              <MarketplaceFilterProvider>
                <PeriodProvider>
                  {children}
                </PeriodProvider>
              </MarketplaceFilterProvider>
            </AmazonAccountProvider>
          </AuthProvider>
        </ThemeProvider>
        {/* AI Chatbot — hidden on /login via CSS if needed */}
        <ChatWidget />
      </body>
    </html>
  );
}
