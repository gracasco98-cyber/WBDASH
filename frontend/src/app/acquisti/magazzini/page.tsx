"use client";
import { Boxes } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import MagazziniTab from "@/components/purchasing/MagazziniTab";

export default function MagazziniPage() {
  return (
    <div className="min-h-screen bg-[#f5f6fa] text-slate-900">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <main className="flex-1 min-w-0">
          <div className="max-w-[1600px] mx-auto px-4 md:px-6 py-5 space-y-4">
            <div className="flex items-center gap-2">
              <Boxes size={20} className="text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight">Magazzini</h1>
              <span className="text-[10px] uppercase tracking-widest text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-md px-2 py-1">Tema chiaro</span>
            </div>
            <MagazziniTab />
          </div>
        </main>
      </div>
    </div>
  );
}
