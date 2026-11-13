const fs = require("fs");
const path = require("path");

const { RADICE, PERCORSI } = require("./percorsi");
const { leggiCredenziali, PROVIDER, PROVIDER_PREDEFINITO } = require("./credenziali");

function leggiJson(percorso, predefinito) {
  try {
    return JSON.parse(fs.readFileSync(percorso, "utf8"));
  } catch (errore) {
    if (predefinito !== undefined) return predefinito;
    throw new Error(
      `${path.relative(RADICE, percorso)}: JSON non leggibile (${errore.message}).`
    );
  }
}

function scriviJson(percorso, dati) {
  fs.mkdirSync(path.dirname(percorso), { recursive: true });
  fs.writeFileSync(percorso, JSON.stringify(dati, null, 2) + "\n");
}

function variabile(nome) {
  const valore = process.env[nome];
  return valore && valore.trim() ? valore.trim() : "";
}

function caricaConfig() {
  const config = leggiJson(PERCORSI.config);
  const categorie = leggiJson(PERCORSI.categorie);

  if (!Array.isArray(config.fonti) || !config.fonti.length) {
    throw new Error("_redazione/config.json: elenco delle fonti mancante.");
  }

  return {
    ...config,
    categorie,
    nomiCategorie: categorie.map((categoria) => categoria.nome),
    percorsi: PERCORSI,
  };
}

function telegramConfigurato() {
  return Boolean(variabile("TELEGRAM_BOT_TOKEN") && variabile("TELEGRAM_CHAT_ID"));
}

/**
 * Credenziali del modello: i secret di GitHub hanno la precedenza,
 * altrimenti valgono quelle inserite da Telegram (cifrate nel repository).
 */
function configAi() {
  const daAmbiente = variabile("AI_API_KEY");
  const salvate = daAmbiente ? null : leggiCredenziali();
  const chiave = daAmbiente || salvate?.chiave;

  if (!chiave) {
    throw new Error(
      "Nessuna chiave API configurata. Inviala al bot Telegram con /api <chiave> " +
        "oppure aggiungi il secret AI_API_KEY su GitHub."
    );
  }

  return {
    chiave,
    baseUrl: (
      variabile("AI_BASE_URL") ||
      salvate?.baseUrl ||
      PROVIDER[PROVIDER_PREDEFINITO].baseUrl
    ).replace(/\/+$/, ""),
    modello:
      variabile("AI_MODEL") ||
      salvate?.modello ||
      PROVIDER[PROVIDER_PREDEFINITO].modello,
    timeoutMs: Number(variabile("AI_TIMEOUT_MS") || 180000),
  };
}

function configTelegram() {
  const token = variabile("TELEGRAM_BOT_TOKEN");
  const chatId = variabile("TELEGRAM_CHAT_ID");

  if (!token) {
    throw new Error(
      "Manca il secret TELEGRAM_BOT_TOKEN (token del bot creato con @BotFather)."
    );
  }

  if (!chatId) {
    throw new Error(
      "Manca il secret TELEGRAM_CHAT_ID (ID numerico della tua chat con il bot)."
    );
  }

  return { token, chatId };
}

/** Base dell'API Telegram (sovrascrivibile per test locali). */
function baseTelegram() {
  return (variabile("TELEGRAM_API_BASE") || "https://api.telegram.org").replace(
    /\/+$/,
    ""
  );
}

/** Base pubblica del sito, per i link nelle notifiche Telegram. */
function basePubblica() {
  const esplicita = variabile("SITO_URL");
  if (esplicita) return esplicita.replace(/\/+$/, "");

  const repository = variabile("GITHUB_REPOSITORY");
  if (repository.includes("/")) {
    const [proprietario, nome] = repository.split("/");
    return `https://${proprietario.toLowerCase()}.github.io/${nome}`;
  }

  return "";
}

function urlArticolo(id) {
  const base = basePubblica();
  return base ? `${base}/articoli/${id}/` : `articoli/${id}/`;
}

module.exports = {
  RADICE,
  PERCORSI,
  leggiJson,
  scriviJson,
  caricaConfig,
  configAi,
  configTelegram,
  telegramConfigurato,
  baseTelegram,
  basePubblica,
  urlArticolo,
};
