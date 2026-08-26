/**
 * Shopify OAuth Helper — app "Mirakl" (Partner Dashboard)
 * ────────────────────────────────────────────────────────
 * Uso: node shopify-mirakl-app-auth.js
 *
 * 1. Legge SHOPIFY_MIRAKL_CLIENT_ID / SHOPIFY_MIRAKL_CLIENT_SECRET / SHOPIFY_STORE_DOMAIN dal .env
 * 2. Apre il browser sulla pagina di autorizzazione Shopify per quel negozio
 * 3. Riceve il callback su http://localhost:9000/callback
 * 4. Scambia il codice con un Admin API access token
 * 5. Aggiorna automaticamente SHOPIFY_ADMIN_TOKEN nel file .env
 *
 * Prerequisito: http://localhost:9000/callback deve essere registrato come
 * "URL di reindirizzamento consentiti" nella configurazione dell'app Mirakl
 * nella Partner Dashboard, e gli scope write_orders/read_orders/read_products
 * devono essere abilitati.
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { exec } = require("child_process");
const url = require("url");

// ─── Leggi .env ────────────────────────────────────────────────────────────────
const ENV_FILE = path.join(__dirname, "backend", ".env");

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
const CLIENT_ID     = env.SHOPIFY_MIRAKL_CLIENT_ID;
const CLIENT_SECRET = env.SHOPIFY_MIRAKL_CLIENT_SECRET;
const SHOP          = (env.SHOPIFY_STORE_DOMAIN || "").replace(/^https?:\/\//, "");
const PORT          = 9000;
const REDIRECT_URI  = `http://localhost:${PORT}/callback`;
const SCOPES         = "write_orders,read_orders,read_products";

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("\n❌  SHOPIFY_MIRAKL_CLIENT_ID o SHOPIFY_MIRAKL_CLIENT_SECRET mancanti nel file backend/.env!");
  console.error("    Aggiungili prima di lanciare questo script (ID client e Segreto dalla");
  console.error("    pagina Impostazioni → Credenziali dell'app Mirakl nella Partner Dashboard).\n");
  process.exit(1);
}

if (!SHOP || !SHOP.includes(".myshopify.com")) {
  console.error("\n❌  SHOPIFY_STORE_DOMAIN mancante o non valido nel file backend/.env!");
  console.error("    Deve essere il dominio *.myshopify.com del negozio, non il dominio custom.\n");
  process.exit(1);
}

// ─── Costruisci URL autorizzazione ────────────────────────────────────────────
const STATE = Math.random().toString(36).substring(2, 10);
const AUTH_URL =
  `https://${SHOP}/admin/oauth/authorize` +
  `?client_id=${CLIENT_ID}` +
  `&scope=${encodeURIComponent(SCOPES)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
  `&state=${STATE}`;

// ─── Scambia authorization code con access_token ──────────────────────────────
function exchangeCode(code) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
    });

    const options = {
      hostname: SHOP,
      path: "/admin/oauth/access_token",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json.access_token) resolve(json);
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

  const { code, state, error, shop: callbackShop } = parsed.query;

  const html = (title, body, isError = false) => `
    <!DOCTYPE html>
    <html lang="it">
    <head>
      <meta charset="UTF-8"/>
      <title>Shopify Auth Helper (Mirakl)</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #0a0a0f; color: #e4e4e7; display: flex; justify-content: center; align-items: center; min-height: 100vh; margin: 0; }
        .card { background: #111118; border: 1px solid #1e1e2e; border-radius: 16px; padding: 40px; max-width: 640px; width: 90%; }
        h1 { margin: 0 0 16px; font-size: 22px; color: ${isError ? "#f87171" : "#6ee7b7"}; }
        p { color: #a1a1aa; line-height: 1.6; }
        pre { background: #0a0a0f; border: 1px solid #1e1e2e; border-radius: 8px; padding: 16px; overflow-x: auto; font-size: 13px; color: #6ee7b7; white-space: pre-wrap; word-break: break-all; }
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
    console.error(`\n❌  Shopify ha restituito un errore: ${error}`);
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Errore autorizzazione", `<p>Shopify ha restituito: <code>${error}</code></p>`, true));
    setTimeout(() => server.close(), 2000);
    return;
  }

  if (!code) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ Nessun codice ricevuto", "<p>Shopify non ha inviato nessun codice.</p>", true));
    return;
  }

  if (state !== STATE) {
    console.error("\n❌  State mismatch — possibile richiesta non genuina, interrotto.");
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html("❌ State non corrispondente", "<p>Interrotto per sicurezza.</p>", true));
    setTimeout(() => server.close(), 2000);
    return;
  }

  console.log(`\n🔄  Codice ricevuto per shop=${callbackShop}, scambio con access_token...`);

  try {
    const tokens = await exchangeCode(String(code));
    const accessToken = tokens.access_token;

    updateEnvValue("SHOPIFY_STORE_DOMAIN", SHOP);
    updateEnvValue("SHOPIFY_ADMIN_TOKEN", accessToken);
    console.log("\n✅  Access token ottenuto e salvato in backend/.env!");
    console.log(`\n   Scope concessi: ${tokens.scope}`);
    console.log(`   Token: ${accessToken.substring(0, 20)}...`);

    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "✅ Autorizzazione completata!",
      `<p>Il nuovo <strong>access_token</strong> è stato salvato automaticamente in <code>backend/.env</code>.</p>
      <p>Scope concessi: <code>${tokens.scope}</code></p>
      <pre>${accessToken}</pre>`
    ));
  } catch (err) {
    console.error("\n❌  Errore scambio token:", err.message);
    res.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html(
      "❌ Errore scambio token",
      `<p>Impossibile ottenere l'access_token:</p><pre>${err.message}</pre>`,
      true
    ));
  }

  setTimeout(() => server.close(), 3000);
});

// ─── Avvia ────────────────────────────────────────────────────────────────────
const OPEN_CMD = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start \"\"" : "xdg-open";

server.listen(PORT, () => {
  console.log("\n─────────────────────────────────────────────────");
  console.log(" Shopify OAuth Helper — app Mirakl");
  console.log("─────────────────────────────────────────────────");
  console.log(`\n📌  Shop:          ${SHOP}`);
  console.log(`📌  Client ID:     ${CLIENT_ID}`);
  console.log(`📌  Redirect URI:  ${REDIRECT_URI}`);
  console.log(`📌  Scope richiesti: ${SCOPES}`);
  console.log("\n⚠️   IMPORTANTE: prima di continuare, assicurati che");
  console.log(`    [${REDIRECT_URI}] sia negli \"URL di reindirizzamento consentiti\"`);
  console.log("    nella configurazione dell'app Mirakl nella Partner Dashboard.\n");
  console.log("🌐  Apertura browser per autorizzazione Shopify...");
  console.log(`    URL: ${AUTH_URL}\n`);
  console.log("⏳  In attesa del callback su http://localhost:9000/callback ...\n");

  exec(`${OPEN_CMD} "${AUTH_URL}"`, (err) => {
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
