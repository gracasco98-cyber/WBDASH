/**
 * Amazon SP-API OAuth Helper
 * ─────────────────────────
 * Uso: node amazon-auth.js <APPLICATION_ID>
 *   es: node amazon-auth.js amzn1.sp.solution.xxxxxxxx
 *
 * 1. Legge le credenziali LWA dal file .env
 * 2. Apre il browser sulla pagina di autorizzazione Amazon
 * 3. Riceve il callback su http://localhost:9000/callback
 * 4. Scambia il codice con un refresh_token
 * 5. Aggiorna automaticamente AMAZON_EU_REFRESH_TOKEN nel file .env
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

function updateEnvValue(key, value) {
  let content = fs.readFileSync(ENV_FILE, "utf-8");
  const regex = new RegExp(`^${key}=.*$`, "m");
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += `\n${key}=${value}`;
  }
  fs.writeFileSync(ENV_FILE, content, "utf-8");
}

// ─── Config ────────────────────────────────────────────────────────────────────
const env = readEnv();
const CLIENT_ID     = env.AMAZON_LWA_CLIENT_ID;
const CLIENT_SECRET = env.AMAZON_LWA_CLIENT_SECRET;
const PORT          = 9000;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;

const APPLICATION_ID = process.argv[2];

if (!APPLICATION_ID) {
  console.error("\n❌  Manca l'Application ID!");
  console.error("   Uso: node amazon-auth.js <APPLICATION_ID>");
  console.error("   Es.: node amazon-auth.js amzn1.sp.solution.xxxxxxxx\n");
  console.error("   Trovi l'Application ID in Seller Central →");
  console.error("   Apps & Services → Develop Apps → [la tua app] → View\n");
  process.exit(1);
}

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌  AMAZON_LWA_CLIENT_ID o AMAZON_LWA_CLIENT_SECRET mancanti nel file .env!\n");
  process.exit(1);
}

// ─── Costruisci URL autorizzazione (marketplace IT come entry point EU) ────────
const STATE = Math.random().toString(36).substring(2, 10);
const AUTH_URL =
  `https://sellercentral.amazon.it/apps/authorize/consent` +
  `?application_id=${APPLICATION_ID}` +
  `&state=${STATE}` +
  `&version=beta` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

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

// ─── Server locale per il callback ────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);

  if (parsed.pathname !== "/callback") {
    res.writeHead(404);
    return res.end("Not found");
  }

  const { spapi_oauth_code: code, state, error } = parsed.query;

  // Pagina di risposta HTML
  const html = (title, body, isError = false) => `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8"/>
      <title>Amazon Auth Helper</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e4e4e7; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px; max-width: 640px; width: 90%; }
        h1 { margin: 0 0 16px; font-size: 22px; color: ${isError ? "#f87171" : "#6ee7b7"}; }
        p { color: #a1a1aa; line-height: 1.6; }
        pre { background: #0a0a0f; border: 1px solid #1e1e2e; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 13px; color: #6ee7b7; white-space: pre-wrap; word-break: break-all; }
        .step { background: rgba(110,231,183,0.05); border: 1px solid rgba(110,231,183,0.15); border-radius: 8px; padding: 16px; margin-top: 16px; }
        .step strong { color: #6ee7b7; }
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

    // Salva nel .env
    updateEnvValue("AMAZON_EU_REFRESH_TOKEN", refreshToken);
    console.log("\n✅  Refresh token ottenuto e salvato in .env!");
    console.log(`\n   Token: ${refreshToken.substring(0, 40)}...`);
    console.log("\n📋  Prossimo step: riavvia il backend con:");
    console.log("    docker compose restart backend\n");

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "✅ Autorizzazione completata!",
      `<p>Il nuovo <strong>refresh_token</strong> è stato salvato automaticamente nel file <code>.env</code>.</p>
      <pre>${refreshToken}</pre>
      <div class="step">
        <strong>Step finale:</strong>
        <p>Riavvia il backend Docker con questo comando nel terminale:</p>
        <pre>docker compose restart backend</pre>
        <p>Poi vai su <a href="http://192.168.1.43:3000/amazon/sync" style="color:#60a5fa">Amazon → Sync Center</a> e avvia un backfill da 30 giorni.</p>
      </div>`
    ));
  } catch (err) {
    console.error("\n❌  Errore scambio token:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "❌ Errore scambio token",
      `<p>Impossibile ottenere il refresh_token:</p><pre>${err.message}</pre>
       <p>Verifica che <strong>http://localhost:${PORT}/callback</strong> sia registrato come redirect URI nella tua app Seller Central.</p>`,
      true
    ));
  }

  setTimeout(() => server.close(), 3000);
});

// ─── Avvia ────────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log("\n─────────────────────────────────────────────────");
  console.log(" Amazon SP-API OAuth Helper");
  console.log("─────────────────────────────────────────────────");
  console.log(`\n📌  Application ID: ${APPLICATION_ID}`);
  console.log(`📌  Client ID:      ${CLIENT_ID.substring(0, 40)}...`);
  console.log(`📌  Redirect URI:   ${REDIRECT_URI}`);
  console.log("\n⚠️   IMPORTANTE: prima di aprire il browser, assicurati che");
  console.log(`    [${REDIRECT_URI}] sia nella lista dei redirect URI consentiti`);
  console.log("    nella tua app in Seller Central → Develop Apps → View → Edit\n");
  console.log("🌐  Apertura browser per autorizzazione Amazon...");
  console.log(`    URL: ${AUTH_URL.substring(0, 80)}...`);
  console.log("\n⏳  In attesa del callback su http://localhost:9000/callback ...\n");

  // Apri il browser (Windows)
  exec(`start "" "${AUTH_URL}"`, (err) => {
    if (err) {
      console.log("\n⚠️   Browser non aperto automaticamente.");
      console.log("    Apri manualmente questo URL nel browser:\n");
      console.log(`    ${AUTH_URL}\n`);
    }
  });
});

server.on("error", (err) => {
  console.error(`\n❌  Errore server: ${err.message}`);
  console.error(`    Assicurati che la porta ${PORT} sia libera.\n`);
  process.exit(1);
});
