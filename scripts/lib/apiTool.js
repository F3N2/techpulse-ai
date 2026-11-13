const fs = require("fs");

const { PERCORSI } = require("./percorsi");
const { leggiJson } = require("./config");
const { cifra, decifra } = require("./credenziali");

/** Endpoint compatibile OpenAI usato per far girare i tool. */
const BASE_PREDEFINITA = "https://api.openai.com/v1";
const MODELLO_PREDEFINITO = "gpt-4o-mini";

function variabile(nome) {
  const valore = process.env[nome];
  return valore && valore.trim() ? valore.trim() : "";
}

/**
 * Legge l'API dei tool salvata da Telegram.
 * Restituisce null se non esiste; lancia un errore se non è decifrabile.
 */
function leggiApiTool() {
  if (!fs.existsSync(PERCORSI.apiTool)) return null;

  try {
    return decifra(fs.readFileSync(PERCORSI.apiTool, "utf8"));
  } catch {
    throw new Error(
      "L'API per i tool salvata non è decifrabile: il token del bot è cambiato? " +
        "Reinseriscila con /toolapi <chiave>."
    );
  }
}

/** Salva (o aggiorna) chiave, endpoint e modello, cifrando tutto. */
function salvaApiTool({ chiave, baseUrl, modello }) {
  let salvate = null;

  try {
    salvate = leggiApiTool();
  } catch {
    salvate = null;
  }

  const dati = {
    chiave: String(chiave ?? salvate?.chiave ?? "").trim(),
    baseUrl: String(baseUrl ?? salvate?.baseUrl ?? BASE_PREDEFINITA).replace(/\/+$/, ""),
    modello: String(modello ?? salvate?.modello ?? MODELLO_PREDEFINITO).trim(),
    inseritaIl: new Date().toISOString(),
  };

  if (!dati.chiave) throw new Error("Manca la chiave dell'API per i tool.");
  if (!/^https?:\/\//i.test(dati.baseUrl)) {
    throw new Error("L'endpoint deve iniziare con http:// o https://");
  }

  fs.mkdirSync(PERCORSI.redazione, { recursive: true });
  fs.writeFileSync(PERCORSI.apiTool, cifra(dati) + "\n", { mode: 0o600 });

  return dati;
}

function eliminaApiTool() {
  if (fs.existsSync(PERCORSI.apiTool)) {
    fs.unlinkSync(PERCORSI.apiTool);
    return true;
  }

  return false;
}

/** Descrizione da mostrare in chat: non contiene mai la chiave. */
function descrizioneApiTool(api) {
  if (!api) return "nessuna API per i tool configurata";
  return `${api.baseUrl} · modello ${api.modello}`;
}

/**
 * Configurazione attiva: il secret di GitHub vince sulla chiave di Telegram,
 * come per l'API della redazione.
 */
function configApiTool() {
  const daAmbiente = variabile("TOOL_API_KEY");
  const salvate = daAmbiente ? null : leggiApiTool();
  const chiave = daAmbiente || salvate?.chiave;

  if (!chiave) {
    throw new Error(
      "Nessuna API per i tool configurata. Invia /toolapi <chiave> al bot " +
        "oppure aggiungi il secret TOOL_API_KEY su GitHub."
    );
  }

  return {
    chiave,
    baseUrl: (
      variabile("TOOL_API_BASE") ||
      salvate?.baseUrl ||
      BASE_PREDEFINITA
    ).replace(/\/+$/, ""),
    modello:
      variabile("TOOL_API_MODEL") || salvate?.modello || MODELLO_PREDEFINITO,
    timeoutMs: Number(variabile("TOOL_API_TIMEOUT_MS") || 60000),
  };
}

async function chiamaChat(api, corpo) {
  let risposta;

  try {
    risposta = await fetch(`${api.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${api.chiave}`,
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(api.timeoutMs || 60000),
    });
  } catch (errore) {
    throw new Error(`rete non raggiungibile su ${api.baseUrl}: ${errore.message}`);
  }

  if (!risposta.ok) {
    const dettaglio = (await risposta.text().catch(() => "")).slice(0, 300);
    throw new Error(`API tool ${risposta.status}: ${dettaglio}`);
  }

  const dati = await risposta.json().catch(() => null);
  const testo = dati?.choices?.[0]?.message?.content;

  if (!testo || !String(testo).trim()) {
    throw new Error("l'API ha risposto senza testo: controlla endpoint e modello");
  }

  return String(testo).trim();
}

/**
 * Fa ragionare l'API configurata sulla tabella dei tool del sito:
 * riceve una richiesta in italiano e indica quale strumento usare.
 */
async function eseguiTool({ richiesta, configurazione, maxTokens = 700 }) {
  const api = configurazione || configApiTool();
  const tools = leggiJson(PERCORSI.tools, []);

  const elenco = (Array.isArray(tools) ? tools : [])
    .map(
      (tool) =>
        `- ${tool.nome} (${tool.categoria}, ${tool.costo}): ${tool.descrizione} ${tool.url}`
    )
    .join("\n");

  const sistema = [
    "Sei l'assistente di NEXORA, un magazine italiano sull'intelligenza artificiale.",
    "Puoi consigliare solo gli strumenti di questa tabella:",
    elenco,
    "Rispondi in italiano in massimo 120 parole: indica lo strumento più adatto, perché, e due o tre passi pratici per usarlo. Se nessuno va bene, dillo e suggerisci l'alternativa più vicina tra quelli elencati. Non inventare strumenti, prezzi o funzioni.",
  ].join("\n\n");

  const testo = await chiamaChat(api, {
    model: api.modello,
    temperature: 0.3,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: richiesta },
    ],
  });

  return { testo, modello: api.modello };
}

/** Prova reale dell'API appena configurata: una richiesta minima. */
async function verificaApiTool(configurazione) {
  try {
    const api = configurazione || configApiTool();

    await chiamaChat(api, {
      model: api.modello,
      temperature: 0,
      max_tokens: 16,
      messages: [
        { role: "system", content: "Rispondi solo con OK." },
        { role: "user", content: "Test di funzionamento." },
      ],
    });

    return { ok: true };
  } catch (errore) {
    return { ok: false, errore: errore.message };
  }
}

module.exports = {
  BASE_PREDEFINITA,
  MODELLO_PREDEFINITO,
  leggiApiTool,
  salvaApiTool,
  eliminaApiTool,
  descrizioneApiTool,
  configApiTool,
  eseguiTool,
  verificaApiTool,
};
