"use client";

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { CalendarDays, Plus, Rocket, Save, Search } from "lucide-react";
import AppHeader from "@/components/layout/AppHeader";
import GlobalSidebar from "@/components/layout/GlobalSidebar";
import {
  api,
  type Launch,
  type LaunchDay,
  type LaunchKeywordDay,
} from "@/lib/api";
import { fmtEur } from "@/lib/fmt";

const today = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome" }).format(
    new Date(),
  );
const emptyDay = {
  fakeRevenue: "",
  fakeOrders: "",
  reviewCount: "",
  reviewRating: "",
  adsCost: "",
  reviewCost: "",
  couponCost: "",
  giveawayCost: "",
  logisticsCost: "",
  otherCost: "",
  note: "",
};
const emptyKeyword = {
  keyword: "",
  position: "",
  previousPosition: "",
  volume: "",
  fakeRevenue: "",
  fakeOrders: "",
  reviewCount: "",
  adsCost: "",
  note: "",
};
type Form = Record<string, string>;

export default function LaunchesPage() {
  const [items, setItems] = useState<Launch[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [dayForm, setDayForm] = useState<Form>(emptyDay);
  const [keywordForm, setKeywordForm] = useState<Form>(emptyKeyword);
  const [message, setMessage] = useState("");
  const load = useCallback(async () => {
    try {
      const result = await api.launches.list();
      setItems(result.launches);
      setSelected((old) => old ?? result.launches[0]?.id ?? null);
    } catch {
      setMessage("Impossibile caricare i lanci");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const launch = items.find((item) => item.id === selected) ?? null;
  const day = launch?.days.find((item) => item.day === date) ?? null;
  useEffect(() => {
    setDayForm(
      day
        ? Object.fromEntries(
            Object.entries(day)
              .filter(([key]) => key in emptyDay)
              .map(([key, value]) => [key, String(value ?? "")]),
          )
        : { ...emptyDay },
    );
  }, [day]);
  const changeDay = (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) =>
    setDayForm((old) => ({ ...old, [event.target.name]: event.target.value }));
  const changeKeyword = (event: ChangeEvent<HTMLInputElement>) =>
    setKeywordForm((old) => ({
      ...old,
      [event.target.name]: event.target.value,
    }));
  const number = (value: string) =>
    value === "" ? undefined : Number(value.replace(",", "."));
  const saveDay = async () => {
    if (!launch) return;
    try {
      const data = Object.fromEntries(
        Object.entries(dayForm).map(([key, value]) => [
          key,
          key === "note" ? value : number(value),
        ]),
      );
      await api.launches.saveDay(launch.id, date, data);
      await load();
      setMessage("Giornata salvata");
    } catch {
      setMessage("Salvataggio non riuscito");
    }
  };
  const saveKeyword = async () => {
    if (!launch || !keywordForm.keyword.trim()) return;
    try {
      const data = Object.fromEntries(
        Object.entries(keywordForm).map(([key, value]) => [
          key === "keyword" || key === "note" ? key : key,
          key === "keyword" || key === "note" ? value : number(value),
        ]),
      );
      await api.launches.saveKeyword(launch.id, date, data as never);
      setKeywordForm({ ...emptyKeyword });
      await load();
      setMessage("Keyword salvata");
    } catch {
      setMessage("Salvataggio keyword non riuscito");
    }
  };
  const create = async () => {
    const product = window.prompt("Nome prodotto");
    if (!product?.trim()) return;
    try {
      await api.launches.create({
        name: `Lancio ${product.trim()}`,
        productName: product.trim(),
        startedOn: today(),
        marketplace: "all",
      });
      await load();
      setMessage("Lancio creato");
    } catch {
      setMessage("Creazione non riuscita");
    }
  };

  return (
    <div className="min-h-screen bg-[#f4f7fb] text-[#172033]">
      <AppHeader
        accentColor="primary"
        centerContent={
          <span className="text-sm font-semibold">Lanci prodotto</span>
        }
      />
      <div className="flex">
        <GlobalSidebar />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-8">
          <div className="mx-auto max-w-[1500px] space-y-6">
            <header className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-[#f1dfaa] bg-[#fff5d9] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.16em] text-[#a37500]">
                  <Rocket size={14} />
                  Controllo lanci
                </div>
                <h1 className="mt-3 text-3xl font-bold tracking-tight">
                  Dai contesto alle vendite.
                </h1>
                <p className="mt-1 text-sm text-[#718096]">
                  Vendite fake, review, ranking e costi manuali separati dai
                  dati reali.
                </p>
              </div>
              <button
                onClick={create}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-[#e4c35a] bg-[#f8e9b5] px-4 py-3 text-sm font-semibold text-[#705300] shadow-sm transition hover:bg-[#f3df96]"
              >
                <Plus size={17} />
                Nuovo lancio
              </button>
            </header>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <Stat
                title="Lanci attivi"
                value={String(items.length)}
                caption="gestiti per prodotto"
              />
              <Stat
                title="Costi lancio"
                value={fmtEur(launch?.totals.launchCost ?? 0)}
                caption="Ads + extra manuali"
              />
              <Stat
                title="Impatto sul profitto"
                value={fmtEur(launch?.totals.netImpact ?? 0)}
                caption="dopo costi lancio"
                positive
              />
              <Stat
                title="Review registrate"
                value={String(launch?.totals.reviews ?? 0)}
                caption="giorno per giorno"
              />
            </div>
            {items.length === 0 ? (
              <Empty onCreate={create} />
            ) : (
              <>
                <section className="overflow-hidden rounded-2xl border border-[#e3e9f2] bg-white shadow-sm">
                  <div className="flex items-center justify-between border-b border-[#edf1f6] px-5 py-4">
                    <div>
                      <h2 className="font-bold">I tuoi lanci</h2>
                      <p className="mt-1 text-xs text-[#8793a5]">
                        Seleziona un prodotto per aprire il registro
                      </p>
                    </div>
                    <span className="rounded-lg bg-[#fff5d9] px-3 py-2 text-xs font-semibold text-[#a37500]">
                      Attivi · {items.length}
                    </span>
                  </div>
                  <div className="flex snap-x gap-3 overflow-x-auto p-4 pb-5 md:grid md:grid-cols-3 md:overflow-visible">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => setSelected(item.id)}
                        className={`min-w-[250px] snap-start rounded-2xl border-2 p-4 text-left transition md:min-w-0 ${item.id === selected ? "border-[#eab308] bg-[#fffaf0]" : "border-[#e3e9f2] hover:border-[#cbd7e7]"}`}
                      >
                        <div className="flex items-start justify-between">
                          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#f5e7c0] text-[#a37500]">
                            <Rocket size={22} />
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#a37500]">
                            {item.status === "ACTIVE"
                              ? "In corso"
                              : item.status}
                          </span>
                        </div>
                        <div className="mt-4 font-bold">{item.productName}</div>
                        <div className="mt-1 text-xs text-[#8390a3]">
                          {item.marketplace} · dal {item.startedOn}
                        </div>
                        <div className="mt-4 flex justify-between text-xs">
                          <span className="text-[#718096]">
                            {item.days.length} giornate
                          </span>
                          <b>{fmtEur(item.totals.netImpact)}</b>
                        </div>
                      </button>
                    ))}
                    <button
                      onClick={create}
                      className="flex min-h-[170px] min-w-[250px] snap-start flex-col items-center justify-center rounded-2xl border border-dashed border-[#cfd8e6] bg-[#fbfcfe] text-[#718096] md:min-w-0"
                    >
                      <Plus size={26} />
                      <span className="mt-2 text-sm font-semibold">
                        Aggiungi prodotto
                      </span>
                      <span className="mt-1 text-xs">
                        Crea una scheda lancio
                      </span>
                    </button>
                  </div>
                </section>
                {launch && (
                  <Workspace
                    launch={launch}
                    date={date}
                    setDate={setDate}
                    day={day}
                    dayForm={dayForm}
                    changeDay={changeDay}
                    saveDay={saveDay}
                    keywordForm={keywordForm}
                    changeKeyword={changeKeyword}
                    saveKeyword={saveKeyword}
                  />
                )}
              </>
            )}
            {message && (
              <button
                onClick={() => setMessage("")}
                className="fixed bottom-5 right-5 rounded-xl border border-[#e3e9f2] bg-white px-4 py-3 text-sm shadow-lg"
              >
                {message}
              </button>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Workspace({
  launch,
  date,
  setDate,
  day,
  dayForm,
  changeDay,
  saveDay,
  keywordForm,
  changeKeyword,
  saveKeyword,
}: {
  launch: Launch;
  date: string;
  setDate: (value: string) => void;
  day: LaunchDay | null;
  dayForm: Form;
  changeDay: (
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => void;
  saveDay: () => void;
  keywordForm: Form;
  changeKeyword: (event: ChangeEvent<HTMLInputElement>) => void;
  saveKeyword: () => void;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[1.45fr_.8fr]">
      <section className="overflow-hidden rounded-2xl border border-[#e3e9f2] bg-white shadow-sm">
        <div className="flex flex-col justify-between gap-3 border-b border-[#edf1f6] px-5 py-4 md:flex-row md:items-center">
          <div>
            <h2 className="font-bold">
              {launch.productName} · Registro giornaliero
            </h2>
            <p className="mt-1 text-xs text-[#8793a5]">
              I dati fake non alterano fatturato reale.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs text-[#718096]">
            <CalendarDays size={15} />
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              className="rounded-lg border border-[#e3e9f2] bg-white px-2 py-1.5"
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead className="bg-[#f8fafc] text-[10px] uppercase tracking-wider text-[#8a97a9]">
              <tr>
                <th className="px-5 py-3 text-left">Giorno</th>
                <th className="px-3 py-3 text-right">Vendite fake</th>
                <th className="px-3 py-3 text-right">Review</th>
                <th className="px-3 py-3 text-right">Ads</th>
                <th className="px-3 py-3 text-right">Costi extra</th>
                <th className="px-5 py-3 text-right">Impatto netto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf1f6]">
              {launch.days.map((item) => (
                <tr
                  key={item.id}
                  onClick={() => setDate(item.day)}
                  className={`cursor-pointer ${item.day === date ? "bg-[#fffcf2]" : "hover:bg-[#fbfcfe]"}`}
                >
                  <td className="px-5 py-3 font-semibold">{item.day}</td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {fmtEur(item.fakeRevenue)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums">
                    {item.reviewCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[#8b5cf6]">
                    {fmtEur(item.adsCost)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-[#d97706]">
                    {fmtEur(item.totalCost - item.adsCost)}
                  </td>
                  <td
                    className={`px-5 py-3 text-right font-bold tabular-nums ${item.netLaunchImpact < 0 ? "text-red-600" : "text-emerald-600"}`}
                  >
                    {fmtEur(item.netLaunchImpact)}
                  </td>
                </tr>
              ))}
              {launch.days.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-10 text-center text-[#8793a5]"
                  >
                    Nessuna giornata: compila il pannello a destra.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <aside className="space-y-5">
        <CostEditor
          form={dayForm}
          change={changeDay}
          save={saveDay}
          date={date}
        />
        <KeywordEditor
          day={day}
          form={keywordForm}
          change={changeKeyword}
          save={saveKeyword}
        />
      </aside>
    </div>
  );
}

function CostEditor({
  form,
  change,
  save,
  date,
}: {
  form: Form;
  change: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  save: () => void;
  date: string;
}) {
  const fields = [
    ["adsCost", "Ads"],
    ["reviewCost", "Review / seeding"],
    ["couponCost", "Coupon"],
    ["giveawayCost", "Omaggio"],
    ["logisticsCost", "Logistica"],
    ["otherCost", "Altro"],
  ];
  return (
    <section className="rounded-2xl border border-[#e3e9f2] bg-white p-5 shadow-sm">
      <h2 className="font-bold">Costi extra manuali</h2>
      <p className="mt-1 text-xs text-[#8793a5]">
        {date} · riducono il profitto del lancio.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {fields.map(([name, label]) => (
          <label key={name} className="text-[10px] text-[#8793a5]">
            {label}
            <input
              name={name}
              value={form[name] ?? ""}
              onChange={change}
              type="number"
              min="0"
              step="0.01"
              placeholder="€ 0,00"
              className="mt-1 w-full rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-right text-sm"
            />
          </label>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <label className="text-[10px] text-[#8793a5]">
          Vendite fake (€)
          <input
            name="fakeRevenue"
            value={form.fakeRevenue ?? ""}
            onChange={change}
            type="number"
            min="0"
            step="0.01"
            className="mt-1 w-full rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-right text-sm"
          />
        </label>
        <label className="text-[10px] text-[#8793a5]">
          Review
          <input
            name="reviewCount"
            value={form.reviewCount ?? ""}
            onChange={change}
            type="number"
            min="0"
            className="mt-1 w-full rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-right text-sm"
          />
        </label>
      </div>
      <textarea
        name="note"
        value={form.note ?? ""}
        onChange={change}
        rows={2}
        placeholder="Nota della giornata"
        className="mt-3 w-full rounded-lg border border-[#e3e9f2] px-3 py-2 text-sm"
      />
      <button
        onClick={save}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#eab308] px-3 py-2.5 text-sm font-bold text-[#5f4600]"
      >
        <Save size={15} />
        Salva giornata
      </button>
    </section>
  );
}

function KeywordEditor({
  day,
  form,
  change,
  save,
}: {
  day: LaunchDay | null;
  form: Form;
  change: (event: ChangeEvent<HTMLInputElement>) => void;
  save: () => void;
}) {
  return (
    <section className="rounded-2xl border border-[#e3e9f2] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold">Keyword · posizione giornaliera</h2>
          <p className="mt-1 text-xs text-[#8793a5]">
            Posizione organica, volume e vendite per parola.
          </p>
        </div>
        <Search size={18} className="text-[#3478d4]" />
      </div>
      <div className="mt-4 space-y-2">
        {(day?.keywords ?? []).map((keyword: LaunchKeywordDay) => (
          <div
            key={keyword.id}
            className="rounded-lg border border-[#e3e9f2] bg-[#fbfcfe] p-3"
          >
            <div className="flex justify-between text-sm font-semibold">
              <span>{keyword.keyword}</span>
              <span className="rounded-full bg-[#eaf8f2] px-2 py-1 text-xs text-[#079669]">
                #{keyword.position ?? "—"}
              </span>
            </div>
            <div className="mt-2 flex justify-between text-[11px] text-[#8793a5]">
              <span>Volume {keyword.volume ?? "—"}</span>
              <span>{fmtEur(keyword.fakeRevenue)} fake</span>
              <span>{keyword.reviewCount} review</span>
            </div>
          </div>
        ))}
        {!day?.keywords.length && (
          <p className="py-2 text-xs text-[#8793a5]">
            Nessuna keyword salvata per questo giorno.
          </p>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <input
          name="keyword"
          value={form.keyword ?? ""}
          onChange={change}
          placeholder="Parola chiave"
          className="col-span-2 rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-sm"
        />
        <input
          name="position"
          value={form.position ?? ""}
          onChange={change}
          placeholder="Posizione"
          type="number"
          min="1"
          className="rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-sm"
        />
        <input
          name="volume"
          value={form.volume ?? ""}
          onChange={change}
          placeholder="Volume"
          type="number"
          min="0"
          className="rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-sm"
        />
        <input
          name="fakeRevenue"
          value={form.fakeRevenue ?? ""}
          onChange={change}
          placeholder="Vendite fake €"
          type="number"
          min="0"
          step="0.01"
          className="rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-sm"
        />
        <input
          name="reviewCount"
          value={form.reviewCount ?? ""}
          onChange={change}
          placeholder="Review"
          type="number"
          min="0"
          className="rounded-lg border border-[#e3e9f2] px-2.5 py-2 text-sm"
        />
      </div>
      <button
        onClick={save}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-[#d9e3f2] bg-[#eaf2ff] px-3 py-2.5 text-xs font-bold text-[#3478d4]"
      >
        <Plus size={14} />
        Salva keyword del giorno
      </button>
    </section>
  );
}

function Stat({
  title,
  value,
  caption,
  positive = false,
}: {
  title: string;
  value: string;
  caption: string;
  positive?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e3e9f2] bg-white p-4 shadow-sm">
      <div className="text-[10px] uppercase tracking-wider text-[#8a97a9]">
        {title}
      </div>
      <div
        className={`mt-2 text-2xl font-bold tabular-nums ${positive ? "text-emerald-600" : "text-[#172033]"}`}
      >
        {value}
      </div>
      <div className="mt-2 text-xs text-[#8793a5]">{caption}</div>
    </div>
  );
}
function Empty({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-[#cfd8e6] bg-white p-12 text-center shadow-sm">
      <Rocket size={34} className="mx-auto text-[#eab308]" />
      <h2 className="mt-3 font-bold">Crea il primo lancio</h2>
      <p className="mt-1 text-sm text-[#8793a5]">
        Apri una scheda prodotto per registrare vendite, review, keyword e costi
        per giorno.
      </p>
      <button
        onClick={onCreate}
        className="mt-5 rounded-xl border border-[#e4c35a] bg-[#f8e9b5] px-4 py-2.5 text-sm font-semibold text-[#705300] shadow-sm transition hover:bg-[#f3df96]"
      >
        <Plus size={15} className="mr-2 inline" />
        Nuovo lancio
      </button>
    </div>
  );
}
