/**
 * Controllo di sicurezza eseguito prima di ogni pubblicazione:
 * blocca il deploy se trova una credenziale in chiaro nei file che finiscono online.
 */
const fs = require("fs");
const path = require("path");

const RADICE = path.resolve(__dirname, "..");
const CARTELLE = ["src", "_site", "_redazione"];
const ESTENSIONI = new Set([
  ".html",
  ".njk",
  ".json",
  ".js",
  ".md",
  ".css",
  ".txt",
  ".xml",
  ".svg",
]);

const FIRME = [
  { nome: "chiave API (formato sk-…)", espressione: /\bsk-[A-Za-z0-9_-]{20,}/ },
  { nome: "token di bot Telegram", espressione: /\b\d{8,12}:[A-Za-z0-9_-]{30,}/ },
  { nome: "chiave Google", espressione: /\bAIza[0-9A-Za-z_-]{30,}/ },
  { nome: "token GitHub", espressione: /\bgh[pousr]_[A-Za-z0-9]{30,}/ },
  { nome: "chiave privata", espressione: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  {
    nome: "assegnazione di un segreto nel codice",
    espressione: /(TELEGRAM_BOT_TOKEN|AI_API_KEY|REDAZIONE_SEGRETO)\s*[:=]\s*["'][^"'\s]{16,}["']/,
  },
];

function elencaFile(cartella) {
  const trovatati = [];

  if (!fs.existsSync(cartella)) return trovatati;

  for (const voce of fs.readdirSync(cartella, { withFileTypes: true })) {
    const percorso = path.join(cartella, voce.name);

    if (voce.isDirectory()) {
      if (voce.name === "node_modules" || voce.name === ".git") continue;
      trovatati.push(...elencaFile(percorso));
      continue;
    }

    if (ESTENSIONI.has(path.extname(voce.name))) trovatati.push(percorso);
  }

  return trovatati;
}

function main() {
  const problemi = [];

  for (const cartella of CARTELLE) {
    for (const file of elencaFile(path.join(RADICE, cartella))) {
      const relativo = path.relative(RADICE, file);

      if (/credenziali/i.test(path.basename(file)) && path.extname(file) !== ".enc") {
        problemi.push(`${relativo}: file di credenziali non cifrato nel progetto`);
        continue;
      }

      let contenuto = "";

      try {
        contenuto = fs.readFileSync(file, "utf8");
      } catch (errore) {
        problemi.push(`${relativo}: illeggibile (${errore.message})`);
        continue;
      }

      for (const firma of FIRME) {
        const trovato = contenuto.match(firma.espressione);

        if (trovato) {
          problemi.push(
            `${relativo}: possibile ${firma.nome} → ${trovato[0].slice(0, 8)}…`
          );
        }
      }
    }
  }

  const sito = path.join(RADICE, "_site");

  if (fs.existsSync(sito)) {
    for (const file of elencaFile(sito)) {
      if (/credenziali|bozze|archivio/i.test(path.basename(file))) {
        problemi.push(
          `${path.relative(RADICE, file)}: file della redazione finito nel sito pubblicato`
        );
      }
    }
  }

  if (problemi.length) {
    console.error("Controllo di sicurezza fallito:\n- " + problemi.join("\n- "));
    process.exit(1);
  }

  console.log(
    "Controllo di sicurezza superato: nessuna credenziale in chiaro nei file del sito."
  );
}

main();
