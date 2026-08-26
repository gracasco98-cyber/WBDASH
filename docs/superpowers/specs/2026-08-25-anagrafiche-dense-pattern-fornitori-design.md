# Anagrafiche — Pattern denso/professionale (Fase 1: Fornitori) — Design

Data: 2026-08-25
Stato: design approvato dall'utente (mockup A selezionato), pronto per `writing-plans`.
Origine: l'utente ha condiviso screenshot di un altro gestionale ("Hatweb Trade" — Anagrafica prodotti, Magazzino, Anagrafica fornitori) chiedendo di adottarne lo stile: tabelle dense, tab Attivi/Disattivati con contatore, stat-tile riassuntive, ricerca in alto. Dopo un chiarimento sullo scope (vedi §2), si è deciso di partire da **Fornitori** come area pilota, con componenti pensati per essere riusabili altrove in fasi successive.

---

## 1. Obiettivo

Portare la pagina Fornitori (`frontend/src/components/purchasing/FornitoriTab.tsx`) da tabella semplice a 5 colonne a un layout più denso e informativo, ispirato agli screenshot di riferimento, usando il **tema chiaro già esistente** in WBDASH (nessuna palette nuova — vedi §2).

## 2. Chiarimenti di scope emersi in brainstorming

- **Colori**: WBDASH ha già un tema chiaro completo e funzionante (`frontend/src/app/globals.css`, `[data-theme="light"]`), è pure il tema di default (`ThemeProvider.tsx`) con toggle già in `AppHeader.tsx`. Questo lavoro non tocca colori/palette — riusa i token esistenti (`--bg-base`, `--bg-card`, `--body-color`, `--text-secondary`, `--accent-primary-rgb` ecc.).
- **Densità/layout**: il redesign colori del 12 agosto (`docs/superpowers/specs/2026-08-12-color-redesign-foundation-design.md`) aveva esplicitamente escluso variazioni di densità/layout ("il redesign lavora su colori/coerenza, non su layout"). Questo lavoro **supera volutamente** quel vincolo per le aree che tocca — non lo contraddice per errore, è una direzione nuova e consapevole.
- **Ambito**: l'utente vorrebbe idealmente questo pattern su tutta l'app. Per via dei vincoli di processo del progetto (`CLAUDE.md`: PR ≤500 LOC, una branch = un obiettivo — lo stesso approccio già usato per il redesign colori, anch'esso "per tutta l'app" ma eseguito a fasi), si costruisce qui il pattern e i componenti pensandoli riusabili, ma si applicano **solo a Fornitori** in questa fase. L'estensione a Magazzini/Banche/Condizioni di pagamento/Ordini/Dashboard/Amazon è materia di fasi successive separate, non di questa spec.

## 3. Design approvato (mockup "A" nel companion visivo)

Struttura della pagina, dall'alto in basso:

1. **Intestazione**: titolo "Fornitori" + pillola riassuntiva ("42 fornitori · 6 senza condizione pagamento"), sottotitolo descrittivo, ricerca a destra, bottone "+ Nuovo Fornitore" (comportamento invariato, link a `/acquisti/fornitori/nuovo`).
2. **Stat-tile** (3 riquadri): Attivi, Disattivati, Senza condizione di pagamento — quest'ultimo è un indicatore di qualità dati (evidenzia anagrafiche incomplete), non solo estetico.
3. **Tab Attivi/Disattivati** con contatore, filtro client-side sulla lista già caricata.
4. **Tabella densa**: Fornitore (ragione sociale + codice interno sotto, come sottotitolo muto) · Tipo · P.IVA · Condizione di pagamento · Prodotti collegati · Stato.

Fuori scope per questa fase (per non sovraccaricare il pilota): nessuna selezione multipla/azioni bulk, nessuna riga espandibile — il click su una riga apre comunque `/acquisti/fornitori/[id]` come oggi.

## 4. Componenti condivisi nuovi

Non esiste oggi una cartella per componenti cross-dominio (`frontend/src/components/` è organizzata per dominio: `purchasing/`, `amazon/`, `products/`, `auth/`, `layout/`, `dashboard/`). Si introduce `frontend/src/components/ui/` per i building block riusabili di questo pattern, pensati genericamente ma senza overengineering (niente sistema di routing/config nei tab, niente astrazione oltre le props che servono oggi):

- **`PageHeader.tsx`**: `{ title: string; summary?: string; subtitle?: string; search?: { value: string; onChange: (v: string) => void; placeholder?: string }; actions?: React.ReactNode }`.
- **`StatTile.tsx`** + **`StatTileRow.tsx`**: `StatTile: { value: number | string; label: string; tone?: "primary" | "neutral" | "amber" }`, `StatTileRow` è un semplice grid a N colonne di `StatTile`.
- **`TabsWithCount.tsx`**: `{ tabs: { id: string; label: string; count: number }[]; activeId: string; onChange: (id: string) => void }`.

Questi tre componenti sono lo strato riusabile per le fasi successive (altre anagrafiche) — nessun altro componente nuovo condiviso è necessario per questa fase.

## 5. Backend — dati aggiuntivi richiesti dalla tabella

**`backend/src/repositories/purchasing/suppliers.repo.ts`** (modifica) — `findAllSuppliers()` deve includere il nome della condizione di pagamento predefinita e il conteggio prodotti collegati, stesso pattern `_count` già usato in FN-Task 2 (Fondamenta):

```ts
export async function findAllSuppliers(prisma: PrismaClient) {
  return prisma.supplier.findMany({
    orderBy: { legalName: "asc" },
    include: {
      defaultPaymentTerm: { select: { name: true } },
      _count: { select: { products: true } },
    },
  });
}
```

`findSupplierById()` (usata dalla pagina di dettaglio, invariata in questa fase) non viene toccata.

**`frontend/src/lib/api/suppliers.ts`** (modifica) — `Supplier` guadagna:

```ts
defaultPaymentTerm: { name: string } | null;
_count: { products: number };
```

## 6. Colonne della tabella — dettagli di visualizzazione

- **P.IVA**: `vatNumber ?? foreignVatNumber ?? "—"` (fornitori esteri hanno `foreignVatNumber`, non `vatNumber`).
- **Condizione**: `defaultPaymentTerm?.name`, altrimenti testo `"— mancante"` in ambra (`accent-amber`) — coerente con lo stat-tile "Senza condizione pagamento".
- **Prodotti**: badge con `_count.products`, stile identico ai contatori d'uso già introdotti su Magazzini/Condizioni di pagamento (Fondamenta) — badge neutro se 0, badge blu se > 0.
- **Ricerca**: client-side sulla lista già caricata da `api.suppliers.list()`, filtro su `legalName`, `tradeName`, `internalCode`, `vatNumber` (case-insensitive, substring match) — stessa scala ridotta di oggi (decine di fornitori), nessun endpoint di ricerca server-side necessario.
- **Tab Attivi/Disattivati**: client-side, filtro su `isActive`, contatori calcolati dalla lista caricata (non richiedono chiamate separate).

## 7. Cosa NON fa questa fase

- Nessuna estensione ad altre pagine (Magazzini, Banche, Condizioni di pagamento, Ordini, Dashboard, Amazon) — solo Fornitori.
- Nessuna selezione multipla/azione bulk sulle righe.
- Nessuna riga espandibile con dettagli inline.
- Nessuna modifica alla pagina di dettaglio fornitore (`fornitori/[id]/page.tsx`, `SupplierForm.tsx`) — resta invariata.
- Nessuna modifica al meccanismo di ricerca (resta client-side, non un nuovo endpoint `GET /suppliers?search=`).

## 8. Rischi

- **Cambio di tipo di ritorno di `findAllSuppliers()`**: l'unico consumer è la route `GET /suppliers` (verificare in fase di piano che non ci siano altri call-site che assumano la vecchia forma senza `_count`/`defaultPaymentTerm`).
- **Componenti condivisi troppo generici troppo presto**: mitigato tenendo le props allo stretto necessario per Fornitori oggi (nessuna funzionalità speculativa per usi futuri non ancora richiesti).
- **`foreignVatNumber` vs `vatNumber`**: nessun fornitore dovrebbe avere entrambi vuoti se ha una P.IVA valida, ma il fallback `"—"` copre il caso (fornitori con solo `taxCode`, es. persone fisiche italiane senza P.IVA).

## 9. Prossimo step

Design approvato in sessione (mockup A). Prossimo passo: `writing-plans`.
