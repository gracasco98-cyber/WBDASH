"use client";
import { CheckCircle2, FileClock, Languages, Save } from "lucide-react";

export interface CommunicationData { title: string; bullets: string[]; description: string; keywords: string; }
export default function CommunicationTab({ value, onChange }: { value: CommunicationData; onChange: (value: CommunicationData) => void }) {
  const score = Math.min(100, Math.round((value.title.length ? 20 : 0) + value.bullets.filter(Boolean).length * 10 + (value.description.length > 500 ? 20 : value.description.length / 25) + (value.keywords.length ? 10 : 0)));
  return <div className="grid xl:grid-cols-[1fr_300px] gap-4">
    <div className="space-y-4">
      <Editor label="Titolo Amazon" count={`${value.title.length}/200`}><textarea rows={3} value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} className="editor-field" placeholder="Titolo prodotto ottimizzato…"/></Editor>
      <Editor label="Bullet point" count={`${value.bullets.filter(Boolean).length}/5`}>{value.bullets.map((bullet, index) => <div key={index} className="flex gap-2"><span className="mt-2.5 text-[10px] font-bold text-accent-amber">{index + 1}</span><textarea rows={2} value={bullet} onChange={(e) => onChange({ ...value, bullets: value.bullets.map((item, i) => i === index ? e.target.value : item) })} className="editor-field" placeholder={`Bullet ${index + 1}`}/></div>)}</Editor>
      <Editor label="Descrizione prodotto" count={`${value.description.length} caratteri`}><textarea rows={10} value={value.description} onChange={(e) => onChange({ ...value, description: e.target.value })} className="editor-field" placeholder="Descrizione estesa…"/></Editor>
      <Editor label="Keyword prioritarie" count="separate da virgola"><textarea rows={3} value={value.keywords} onChange={(e) => onChange({ ...value, keywords: e.target.value })} className="editor-field" placeholder="diosmina, esperidina, gambe…"/></Editor>
    </div>
    <aside className="space-y-3">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><span className="text-xs font-bold text-slate-800">Qualità contenuto</span><span className="text-xl font-bold text-[#8a6508]">{score}%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-[#9a7412]" style={{ width: `${score}%` }}/></div><div className="mt-4 space-y-2 text-[11px]"><Check text="Titolo presente" ok={!!value.title}/><Check text="5 bullet completati" ok={value.bullets.filter(Boolean).length === 5}/><Check text="Descrizione completa" ok={value.description.length > 500}/><Check text="Keyword definite" ok={!!value.keywords}/></div></div>
      <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="flex items-center gap-2 text-xs font-bold text-slate-800"><FileClock size={15} className="text-[#8a6508]"/>Versione di lavoro</div><p className="text-[11px] leading-relaxed text-slate-500">Ogni modifica viene salvata nel workspace. La pubblicazione su Amazon resta separata e controllata.</p><div className="flex items-center gap-2 text-[10px] text-emerald-700"><Save size={12}/>Salvataggio automatico attivo</div><div className="flex items-center gap-2 text-[10px] text-slate-500"><Languages size={12}/>Italiano · Amazon.it</div></div>
    </aside>
    <style jsx global>{`.editor-field{width:100%;resize:vertical;border:1px solid #d8dee8;border-radius:.7rem;background:#f8fafc;padding:.7rem .8rem;color:#334155;font-size:12px;line-height:1.55;outline:none}.editor-field:focus{border-color:#b18a22;background:#fff;box-shadow:0 0 0 3px rgba(177,138,34,.1)}`}</style>
  </div>;
}
function Editor({ label, count, children }: { label: string; count: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><div className="mb-3 flex items-center justify-between"><h2 className="text-xs font-bold text-slate-800">{label}</h2><span className="text-[10px] text-slate-400">{count}</span></div><div className="space-y-2">{children}</div></section>; }
function Check({ text, ok }: { text: string; ok: boolean }) { return <div className={`flex items-center gap-2 ${ok ? "text-emerald-700" : "text-slate-400"}`}><CheckCircle2 size={13}/>{text}</div>; }
