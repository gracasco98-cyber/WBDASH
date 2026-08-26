"use client";
import { useRouter } from "next/navigation";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import ContactForm, { EMPTY_CONTACT_FORM, ContactFormState } from "@/components/purchasing/ContactForm";
import { api } from "@/lib/api";

export default function NuovoClientePage() {
  const router = useRouter();

  const handleSubmit = async (form: ContactFormState) => {
    await api.purchasing.businessContacts.create({
      type: "CLIENTE", name: form.name, referent: form.referent || undefined, email: form.email || undefined,
      phone: form.phone || undefined, address: form.address || undefined, notes: form.notes || undefined,
    });
    router.push("/acquisti/anagrafiche");
  };

  return (
    <div className="min-h-screen bg-bg-base">
      <AppHeader accentColor="primary" />
      <div className="flex">
        <GlobalSidebar />
        <div className="flex-1 min-w-0">
          <main className="max-w-3xl px-4 md:px-6 py-4 md:py-6 space-y-4">
            <h1 className="text-lg sm:text-xl font-bold text-white">Nuovo Cliente</h1>
            <ContactForm initial={EMPTY_CONTACT_FORM} submitLabel="Crea cliente" onSubmit={handleSubmit} />
          </main>
        </div>
      </div>
    </div>
  );
}
