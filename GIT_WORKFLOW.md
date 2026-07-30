# Git Workflow — My Dashboard

## Branch Strategy (Git Flow semplificato)

```
main          ← produzione stabile, sempre deployabile
develop       ← integrazione continua, default per nuove feature
feature/*     ← nuove funzionalità (da develop)
fix/*         ← bugfix (da develop o main se urgente)
release/*     ← preparazione release (da develop → main)
hotfix/*      ← fix critici in produzione (da main → main + develop)
```

## Convenzione Commit Messages

Formato: `type(scope): descrizione breve`

| Type       | Quando usarlo                              |
|------------|--------------------------------------------|
| `feat`     | Nuova funzionalità                         |
| `fix`      | Bugfix                                     |
| `ui`       | Modifiche UI/UX senza logica              |
| `refactor` | Refactoring senza cambi funzionali         |
| `perf`     | Miglioramento performance                  |
| `data`     | Modifiche schema DB, migrazioni            |
| `api`      | Modifiche API backend                      |
| `chore`    | Config, dipendenze, build                  |
| `docs`     | Solo documentazione                        |

### Esempi
```
feat(cogs): add temporal price history with supplier tracking
fix(overview): custom date filter timezone UTC→Italy correction
ui(cogs): redesign product table with expandable price chart
api(amazon): add /cogs/entries CRUD endpoints
data(prisma): add AmazonCogsPriceEntry model with indexes
```

## Milestone & Release Plan

### v1.0.0 — MVP (attuale)
- [x] Overview cross-channel (Shopify + Amazon)
- [x] KPI cards combinate
- [x] Grafico vendite stacked area
- [x] Tabella marketplace unificata
- [x] Live feed ordini cross-channel
- [x] Prodotti cross-channel con breakdown per canale
- [x] Filtro custom date con timezone Italy
- [x] Amazon COGS con storico prezzi temporale

### v1.1.0 — Analytics
- [ ] Report P&L mensile completo
- [ ] Export CSV/Excel per ogni sezione
- [ ] Alert soglie (ACOS, margine, stock)

### v1.2.0 — Automazione
- [ ] Webhook Shopify real-time
- [ ] Sync Amazon automatico schedulato
- [ ] Notifiche email/Slack

### v2.0.0 — Multi-account
- [ ] Supporto più store Shopify
- [ ] Supporto più account Amazon
- [ ] Dashboard multi-brand
