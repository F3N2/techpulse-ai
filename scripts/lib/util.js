const crypto = require("crypto");

const FUSO = "Europe/Rome";

/** Data in formato YYYY-MM-DD nel fuso italiano. */
function dataRoma(data = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(data);
}

/** Data compatta YYYYMMDD usata negli ID degli articoli. */
function giornoCompatto(data = new Date()) {
  return dataRoma(data).replace(/-/g, "");
}

function impronta(testo) {
  return crypto
    .createHash("sha1")
    .update(String(testo ?? ""))
    .digest("hex")
    .slice(0, 16);
}

/** Normalizza un testo per confronti tolleranti (accenti, maiuscole, punteggiatura). */
function normalizza(testo) {
  return String(testo ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Decodifica le entità numeriche che arrivano dentro i blocchi CDATA dei feed. */
function decodificaEntita(testo) {
  const carattere = (codice) =>
    Number.isFinite(codice) && codice > 0 && codice <= 0x10ffff
      ? String.fromCodePoint(codice)
      : " ";

  return String(testo ?? "")
    .replace(/&#x([0-9a-f]+);/gi, (_, esadecimale) =>
      carattere(Number.parseInt(esadecimale, 16))
    )
    .replace(/&#(\d+);/g, (_, decimale) =>
      carattere(Number.parseInt(decimale, 10))
    );
}

/** Trasforma un frammento HTML (es. descrizione di un feed) in testo leggibile. */
function pulisci(testo) {
  return decodificaEntita(testo)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Toglie la sintassi markdown, per le anteprime su Telegram. */
function pulisciMarkdown(testo) {
  return String(testo ?? "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[*_`>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function tronca(testo, massimo) {
  const valore = String(testo ?? "");
  if (valore.length <= massimo) return valore;
  return valore.slice(0, massimo - 1).trimEnd() + "…";
}

function escapeHtml(testo) {
  return String(testo ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function contaParole(testo) {
  return String(testo ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function log(...parti) {
  console.log(`[redazione ${new Date().toISOString()}]`, ...parti);
}

module.exports = {
  dataRoma,
  giornoCompatto,
  impronta,
  normalizza,
  decodificaEntita,
  pulisci,
  pulisciMarkdown,
  tronca,
  escapeHtml,
  contaParole,
  log,
};
