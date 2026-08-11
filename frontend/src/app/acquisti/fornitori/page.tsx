"use client";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import FornitoriTab from "@/components/purchasing/FornitoriTab";

export default function FornitoriPage() {
  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-[1600px] px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Fornitori</h1>
            <FornitoriTab />
          </main>
        </div>
      </div>
    </div>
  );
}
