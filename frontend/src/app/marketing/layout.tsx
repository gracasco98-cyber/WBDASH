"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";

// Shell for the Marketing section. Currently only hosts the Redcare Keyword
// BI page; a future Amazon-tab placeholder (mirroring the sub-nav pattern in
// frontend/src/app/amazon/layout.tsx) has a natural home here once that's
// needed — out of scope for now, this is just the shared AppHeader +
// GlobalSidebar shell every other section composes.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader />

      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
