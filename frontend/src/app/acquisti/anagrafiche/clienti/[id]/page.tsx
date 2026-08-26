"use client";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";
import type { BusinessContact } from "@/lib/api/purchasing";

export default function ModificaClientePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [contact, setContact] = useState<BusinessContact | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    api.purchasing.businessContacts.list()
      .then(rows => setContact(rows.find(c => c.id === params.id && c.type === "CLIENTE") ?? null))
      .finally(() => setLoading(false));
  }, [params.id]);
  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.update(params.id, {
      name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  if (loading) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Caricamento…</div>;
  if (!contact) return <div className="min-h-screen bg-bg-base flex items-center justify-center text-zinc-500 text-sm">Cliente non trovato</div>;

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">{contact.name}</h1>
            <ContactForm
              initial={{
                name: contact.name, referent: contact.referent ?? "", email: contact.email ?? "",
                phone: contact.phone ?? "", address: contact.address ?? "", notes: contact.notes ?? "",
              }}
              submitLabel="Salva modifiche"
              onSubmit={handleSubmit}
            />
          </main>
        </div>
      </div>
    </div>
  );
}
