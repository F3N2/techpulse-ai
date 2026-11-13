const fs = require("fs");
const crypto = require("crypto");

const { PERCORSI } = require("./percorsi");

/**
 * Provider supportati, con endpoint e modello predefinito.
 * I modelli "flash" di Z.ai sono gratuiti: buon punto di partenza.
 */
const PROVIDER = {
  zai: {
    nome: "Z.ai (GLM)",
    baseUrl: "https://api.z.ai/api/paas/v4",
    modello: "glm-4.7-flash",
    nota: "modello flash gratuito",
  },
  openai: {
    nome: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modello: "gpt-4o-mini",
    nota: "a consumo, molto economico",
  },
};

const PROVIDER_PREDEFINITO = "zai";

/** Segreto da cui deriva la chiave di cifratura: mai nel repository. */
function segreto() {
  const dedicato = process.env.REDAZIONE_SEGRETO;

  if (dedicato && dedicato.trim()) return dedicato.trim();

  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (token && token.trim()) return token.trim();

  throw new Error(
    "Manca il segreto per cifrare la chiave API: serve TELEGRAM_BOT_TOKEN (o REDAZIONE_SEGRETO)."
  );
}

// Parametri del KDF registrati nel file: così una busta vecchia resta leggibile
// anche quando si alza il costo di derivazione.
const PARAMETRI_V1 = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const PARAMETRI_KDF = { N: 32768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };

function derivaChiave(salt, parametri = PARAMETRI_KDF) {
  return crypto.scryptSync(segreto(), salt, 32, {
    N: parametri.N,
    r: parametri.r,
    p: parametri.p,
    maxmem: parametri.maxmem,
  });
}

function cifra(oggetto) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const cifrario = crypto.createCipheriv(
    "aes-256-gcm",
    derivaChiave(salt, PARAMETRI_KDF),
    iv
  );
  const dati = Buffer.concat([
    cifrario.update(JSON.stringify(oggetto), "utf8"),
    cifrario.final(),
  ]);

  return JSON.stringify(
    {
      versione: 2,
      algoritmo: "aes-256-gcm",
      kdf: PARAMETRI_KDF,
      salt: salt.toString("base64"),
      iv: iv.toString("base64"),
      tag: cifrario.getAuthTag().toString("base64"),
      dati: dati.toString("base64"),
      aggiornatoIl: new Date().toISOString(),
    },
    null,
    2
  );
}

function decifra(testo) {
  const busta = JSON.parse(testo);
  const parametri = busta.kdf || PARAMETRI_V1;
  const decifratore = crypto.createDecipheriv(
    "aes-256-gcm",
    derivaChiave(Buffer.from(busta.salt, "base64"), parametri),
    Buffer.from(busta.iv, "base64")
  );

  decifratore.setAuthTag(Buffer.from(busta.tag, "base64"));

  const chiaro = Buffer.concat([
    decifratore.update(Buffer.from(busta.dati, "base64")),
    decifratore.final(),
  ]);

  return JSON.parse(chiaro.toString("utf8"));
}

/**
 * Legge le credenziali salvate.
 * Restituisce null se non esistono; lancia un errore se non sono decifrabili.
 */
function leggiCredenziali() {
  if (!fs.existsSync(PERCORSI.credenziali)) return null;

  try {
    return decifra(fs.readFileSync(PERCORSI.credenziali, "utf8"));
  } catch {
    throw new Error(
      "La chiave API salvata non è decifrabile: il token del bot è cambiato? " +
        "Reinseriscila con /api <chiave> su Telegram."
    );
  }
}

function salvaCredenziali({ chiave, provider = PROVIDER_PREDEFINITO, modello }) {
  const preset = PROVIDER[provider];

  if (!preset) {
    throw new Error(
      `Provider sconosciuto: ${provider}. Disponibili: ${Object.keys(PROVIDER).join(", ")}.`
    );
  }

  const credenziali = {
    chiave: String(chiave).trim(),
    provider,
    baseUrl: preset.baseUrl,
    modello: String(modello || preset.modello).trim(),
    inseritaIl: new Date().toISOString(),
  };

  fs.mkdirSync(PERCORSI.redazione, { recursive: true });
  fs.writeFileSync(PERCORSI.credenziali, cifra(credenziali) + "\n", { mode: 0o600 });

  return credenziali;
}

function eliminaCredenziali() {
  if (fs.existsSync(PERCORSI.credenziali)) {
    fs.unlinkSync(PERCORSI.credenziali);
    return true;
  }

  return false;
}

function descrizioneProvider(credenziali) {
  if (!credenziali) return "nessun provider configurato";
  const preset = PROVIDER[credenziali.provider];
  return `${preset ? preset.nome : credenziali.provider} · modello ${credenziali.modello}`;
}

module.exports = {
  PROVIDER,
  PROVIDER_PREDEFINITO,
  leggiCredenziali,
  salvaCredenziali,
  eliminaCredenziali,
  descrizioneProvider,
};
