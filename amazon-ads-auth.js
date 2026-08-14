/**
 * Amazon Advertising API OAuth Helper
 * ────────────────────────────────────
 * Uso: node amazon-ads-auth.js
 *
 * 1. Legge AMAZON_ADVERTISING_CLIENT_ID / AMAZON_ADVERTISING_CLIENT_SECRET / AMAZON_SELLER_ID dal file .env
 * 2. Apre il browser sulla pagina di consenso Amazon Ads (profilo "Naturplan")
 * 3. Riceve il callback su http://localhost:9000/callback
 * 4. Scambia il codice con un refresh_token
 * 5. Scopre automaticamente i profileId Ads via GET /v2/profiles
 * 6. Stampa il comando `railway run` pronto da incollare per salvare tutto sull'account di produzione
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const url = require("url");

// ─── Leggi .env ────────────────────────────────────────────────────────────────
const ENV_FILE = path.join(__dirname, ".env");

function readEnv() {
  const env = {};
  if (!fs.existsSync(ENV_FILE)) return env;
  const lines = fs.readFileSync(ENV_FILE, "utf-8").split("\n");
  for (const line of lines) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) env[match[1].trim()] = match[2].trim();
  }
  return env;
}

// ─── Config ────────────────────────────────────────────────────────────────────
const env = readEnv();
const CLIENT_ID     = env.AMAZON_ADVERTISING_CLIENT_ID;
const CLIENT_SECRET = env.AMAZON_ADVERTISING_CLIENT_SECRET;
const SELLER_ID     = env.AMAZON_SELLER_ID;
const PORT          = 9000;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌  AMAZON_ADVERTISING_CLIENT_ID o AMAZON_ADVERTISING_CLIENT_SECRET mancanti nel file .env!\n");
  process.exit(1);
}

if (!SELLER_ID) {
  console.error("\n❌  AMAZON_SELLER_ID mancante nel file .env! Serve per generare il comando finale.\n");
  process.exit(1);
}

function shQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

// ─── Costruisci URL di consenso (endpoint EU) ───────────────────────────────────
const STATE = Math.random().toString(36).substring(2, 10);
const AUTH_URL =
  `https://eu.account.amazon.com/ap/oa` +
  `?client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&scope=advertising::campaign_management` +
  `&response_type=code` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${STATE}`;

// ─── Scambia authorization code con refresh_token ─────────────────────────────
function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      grant_type:    "authorization_code",
      code,
      redirect_uri:  REDIRECT_URI,
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString();

    const options = {
      hostname: "api.amazon.com",
      path:     "/auth/o2/token",
      method:   "POST",
      headers: {
        "Content-Type":   "application/x-www-form-urlencoded",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.refresh_token) resolve(json);
          else reject(new Error(JSON.stringify(json)));
        } catch (e) {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

// ─── Scopri i profileId Ads (GET /v2/profiles) ─────────────────────────────────
function listProfiles(accessToken) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "advertising-api-eu.amazon.com",
      path:     "/v2/profiles",
      method:   "GET",
      headers: {
        "Amazon-Advertising-API-ClientId": CLIENT_ID,
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const profiles = JSON.parse(data);
          if (!Array.isArray(profiles)) return reject(new Error(data));
          const map = {};
          for (const p of profiles) {
            if (p.accountInfo && p.accountInfo.type === "seller" && p.countryCode) {
              map[p.countryCode] = String(p.profileId);
            }
          }
          resolve(map);
        } catch (e) {
          reject(new Error(data));
        }
      });
    });

    req.on("error", reject);
    req.end();
  });
}

// ─── Server locale per il callback ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname !== "/callback") {
    res.writeHead(404);
    return res.end("Not found");
  }

  const { code, error } = parsed.query;

  const html = (title, body, isError = false) => `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8"/>
      <title>Amazon Ads Auth Helper</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e4e4e7; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px; max-width: 720px; width: 90%; }
        h1 { margin: 0 0 16px; font-size: 22px; color: ${isError ? "#f87171" : "#6ee7b7"}; }
        p { color: #a1a1aa; line-height: 1.6; }
        pre { background: #0a0a0f; border: 1px solid #1e1e2e; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 12px; color: #6ee7b7; white-space: pre-wrap; word-break: break-all; }
      </style>
    </head>
    <body>
      <div class="card">
        <h1>${title}</h1>
        ${body}
      </div>
    </body>
    </html>
  `;

  if (error) {
    console.error(`\n❌  Amazon ha restituito un errore: ${error}`);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Errore autorizzazione", `<p>Amazon ha restituito: <code>${error}</code></p>`, true));
    setTimeout(() => server.close(), 2000);
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Nessun codice ricevuto", "<p>Amazon non ha inviato nessun codice.</p>", true));
    return;
  }

  console.log("\n🔄  Codice ricevuto, scambio con refresh_token...");

  try {
    const tokens = await exchangeCode(String(code));
    const refreshToken = tokens.refresh_token;
    console.log("\n✅  Refresh token ottenuto.");

    console.log("\n🔍  Scoperta profili Ads (GET /v2/profiles)...");
    const profileIds = await listProfiles(tokens.access_token);
    console.log(`\n✅  Profili trovati: ${JSON.stringify(profileIds)}`);

    const command =
      `railway run npm run --prefix backend set-ads-credentials -- ` +
      `--sellerId=${shQuote(SELLER_ID)} --clientId=${shQuote(CLIENT_ID)} --clientSecret=${shQuote(CLIENT_SECRET)} ` +
      `--refreshToken=${shQuote(refreshToken)} --profileIds=${shQuote(JSON.stringify(profileIds))}`;

    console.log("\n📋  Comando pronto — copialo ed eseguilo per salvare tutto sull'account di produzione:\n");
    console.log(command);
    console.log("");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "✅ Autorizzazione completata!",
      `<p>Refresh token e profili Ads ottenuti. Il comando da eseguire nel terminale è stato stampato lì (contiene segreti, non viene ripetuto qui).</p>
       <p>Profili trovati:</p><pre>${JSON.stringify(profileIds, null, 2)}</pre>`
    ));
  } catch (err) {
    console.error("\n❌  Errore:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Errore", `<pre>${err.message}</pre>`, true));
  }

  setTimeout(() => server.close(), 3000);
});

// ─── Avvia ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log("\n─────────────────────────────────────────────────");
  console.log(" Amazon Advertising API OAuth Helper");
  console.log("─────────────────────────────────────────────────");
  console.log(`\n📌  Client ID:      ${CLIENT_ID.substring(0, 40)}...`);
  console.log(`📌  Redirect URI:   ${REDIRECT_URI}`);
  console.log("\n⚠️   IMPORTANTE: assicurati che questo redirect URI sia registrato");
  console.log("    in Web Settings del profilo di sicurezza Ads su developer.amazon.com\n");
  console.log("🌐  Apertura browser per autorizzazione Amazon Ads...");
  console.log(`\n⏳  In attesa del callback su ${REDIRECT_URI} ...\n`);

  exec(`open "${AUTH_URL}"`, (err) => {
    if (err) {
      console.log("\n⚠️   Browser non aperto automaticamente. Apri manualmente questo URL:\n");
      console.log(`    ${AUTH_URL}\n`);
    }
  });
});

server.on("error", (err) => {
  console.error(`\n❌  Errore server: ${err.message}`);
  console.error(`    Assicurati che la porta ${PORT} sia libera.\n`);
  process.exit(1);
});
