# Collegare Amazon Ads (PPC) — Design

Data: 2026-08-13
Stato: design approvato dall'utente, pronto per `writing-plans`.

---

## 1. Obiettivo

Agganciare le credenziali reali del profilo di sicurezza Amazon Ads "Naturplan" (Client ID + Client Secret, forniti dall'utente) all'`AmazonAccount` esistente **"Account EU Principale"** (sellerId `A1UX7E7RRSY5UK`), generando un refresh token via consenso OAuth reale e scoprendo automaticamente i profileId Ads per marketplace, così che il codice di reporting Ads già presente (`backend/src/amazon/ads-api.service.ts`) possa effettivamente parlare con l'Advertising API.

Il redirect URI `http://localhost:9000/callback` è già stato registrato dall'utente in Web Settings del profilo "Naturplan" (prerequisito completato prima di questo design).

## 2. Bug trovato — fix obbligatorio in questo task

`ads-api.service.ts` costruisce oggi l'header `Amazon-Advertising-API-ClientId` leggendo una variabile d'ambiente **globale** (`AMAZON_ADVERTISING_CLIENT_ID`, con fallback su `AMAZON_LWA_CLIENT_ID`, il client SP-API), non il campo `adsClientId` per-account come fa invece `token.service.ts` per ottenere il token stesso. Con un profilo di sicurezza Ads nuovo e separato da quello SP-API, questo manderebbe silenziosamente il Client ID sbagliato nell'header — ogni chiamata Ads fallirebbe con errore di autenticazione anche a credenziali salvate correttamente sull'account. Va corretto perché altrimenti il resto del task non è verificabile end-to-end.

Fix: nuova funzione `getAdsClientId()` in `token.service.ts`, stesso pattern cache-per-account di `getAdsApiToken()` (stessa formula di fallback `adsClientId ?? lwaClientId` già usata per il token). Tutti i punti in `ads-api.service.ts` che oggi chiamano la funzione sincrona `ADS_CLIENT_ID()` passano ad `await getAdsClientId()`; la funzione env-based viene rimossa.

## 3. Componenti

1. **`backend/src/repositories/amazon/accounts.repo.ts`** — nuova `updateAdsCredentials(prisma, accountId, { adsClientId, adsClientSecret, adsRefreshToken, adsProfileIds })`, cifra `adsClientSecret`/`adsRefreshToken` con `encryptSecret` (stesso meccanismo già usato in `createAccount`), aggiorna solo i campi Ads sul record esistente.
2. **`backend/src/amazon/token.service.ts`** — nuova `getAdsClientId()` (vedi §2).
3. **`backend/src/amazon/ads-api.service.ts`** — sostituisce ogni uso di `ADS_CLIENT_ID()` con `await getAdsClientId()`; rimuove la funzione env-based.
4. **`backend/src/set-ads-credentials.ts`** (nuovo script one-off, stesso stile di `seed-amazon-account.ts` già esistente in produzione) — legge `--sellerId` da CLI e `AMAZON_ADVERTISING_CLIENT_ID` / `AMAZON_ADVERTISING_CLIENT_SECRET` / `AMAZON_ADVERTISING_REFRESH_TOKEN` / un JSON di profileId da variabili d'ambiente (stessi nomi già usati da `seed-amazon-account.ts`, per coerenza), trova l'account per `sellerId`, chiama `updateAdsCredentials()`. Va eseguito con `railway run` — riusa automaticamente le variabili d'ambiente e la chiave di cifratura di produzione, nessun proxy DB manuale.
5. **`amazon-ads-auth.js`** (nuovo, root del repo, gemello di `amazon-auth.js` già esistente) — helper locale:
   - Apre il browser su `https://eu.account.amazon.com/ap/oa` con `client_id`, `scope=advertising::campaign_management`, `response_type=code`, `redirect_uri=http://localhost:9000/callback`, `state` casuale.
   - Riceve il `code` sul server locale `http://localhost:9000/callback` (stesso meccanismo HTTP del gemello SP-API).
   - Scambia il codice per un refresh token sul token endpoint LWA già noto (`https://api.amazon.com/auth/o2/token`, stesso usato da SP-API).
   - Chiama `GET /v2/profiles` (stessa logica di `listProfiles()` in `ads-api.service.ts`, reimplementata qui in JS puro senza dipendere dal backend) per scoprire automaticamente i profileId per marketplace (`accountInfo.type === "seller"`).
   - Stampa a schermo il comando `railway run` completo e pronto da incollare (sellerId, client id/secret, refresh token, profileId JSON) — nessun segreto va ricopiato a mano dall'utente.

## 4. Flusso dati end-to-end

```
utente lancia `node amazon-ads-auth.js`
  → browser: consenso Amazon (profilo "Naturplan")
  → callback locale riceve `code`
  → scambio code → refresh_token
  → GET /v2/profiles con access_token → { IT: "123...", DE: "456...", ... }
  → stampa comando pronto:
      railway run node backend/dist/set-ads-credentials.js \
        --sellerId=A1UX7E7RRSY5UK ...
  → utente (o Claude, con conferma esplicita) esegue il comando
  → set-ads-credentials.ts → updateAdsCredentials() → AmazonAccount aggiornato
  → verifica: isAdsConfigured() e/o una chiamata reale (es. listSPCampaigns) via railway run
```

## 5. Testing

- Unit test per `updateAdsCredentials()` (repository layer, Testcontainers — stesso pattern degli altri test in `backend/tests/`).
- Unit test per `getAdsClientId()` in `token.service.ts` (verifica fallback `adsClientId ?? lwaClientId` e cache).
- Nessuna nuova rotta HTTP → nessun test di route necessario.
- Verifica funzionale reale (unico modo per validare un'integrazione esterna): dopo la scrittura delle credenziali, una chiamata Ads reale via `railway run` (es. `listSPCampaigns` su un profileId scoperto) deve rispondere senza errore 401.

## 6. Rischi

- **Scrittura di credenziali reali in produzione**: il comando `railway run node backend/dist/set-ads-credentials.js` va eseguito solo con conferma esplicita dell'utente al momento, come già fatto per l'incidente di produzione di questa sessione.
- **Profili mancanti**: se l'account non è ancora abilitato ad Advertising su un dato marketplace, quel marketplace risulta semplicemente assente dalla mappa scoperta — nessun errore, comportamento atteso.
- **Redirect URI**: già registrato dall'utente prima di questo design — nessun rischio residuo su questo fronte.

## 7. Fuori scope

- Nessuna UI frontend per la gestione delle credenziali Ads (fuori scope, non richiesto).
- Nessuna route HTTP di update per le credenziali (lo script one-off via `railway run` è sufficiente e più sicuro: nessuna nuova superficie che accetta segreti via HTTP).
- Refresh automatico/rotazione del refresh token: non necessario, LWA gestisce il refresh in automatico via `token.service.ts` una volta salvato.

## 8. Prossimo step

Design approvato in sessione. Prossimo passo: `writing-plans` per il piano di implementazione.
