import fs from "node:fs";
import path from "node:path";
import markdownIt from "markdown-it";

// Formato ID valido: tp-AAAAMMGG-xxxxxx (6 caratteri esadecimali)
const ID_VALIDO = /^tp-\d{8}-[a-f0-9]{6}$/;
const CARTELLA_ARTICOLI = "src/articoli";

// Unico file NON .md ammesso in src/articoli/ (impostazioni comuni)
const FILE_DATI_AMMESSO = "articoli.json";
const CHIAVI_DATI_AMMESSE = ["layout"];
const LAYOUT_ARTICOLO = "articolo.njk";

// Legge il front matter (la parte tra i due "---" in cima al file).
// Restituisce null se manca. Per "approvato" conserva il testo grezzo,
// così "true" tra virgolette NON viene accettato.
function leggiFrontMatter(testo) {
  const m = testo
    .replace(/^\uFEFF/, "")
    .match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
  if (!m) return null;

  const dati = {};
  const grezzi = {};
  for (const riga of m[1].split(/\r?\n/)) {
    const r = riga.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!r) continue;
    const grezzo = r[2].trim();
    let valore = grezzo;
    if (
      valore.length >= 2 &&
      ((valore.startsWith('"') && valore.endsWith('"')) ||
        (valore.startsWith("'") && valore.endsWith("'")))
    ) {
      valore = valore.slice(1, -1).trim();
    }
    dati[r[1]] = valore;
    grezzi[r[1]] = grezzo;
  }
  return { dati, grezzi };
}

// Controlla il file di impostazioni comuni: deve contenere SOLO "layout"
// con il valore previsto. Nessun altro dato può passare da qui.
function controllaFileDati(file, errori) {
  let json;
  try {
    json = JSON.parse(fs.readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch (e) {
    errori.push(`${file}: JSON non valido`);
    return;
  }

  if (json === null || typeof json !== "object" || Array.isArray(json)) {
    errori.push(`${file}: deve contenere un oggetto JSON { ... }`);
    return;
  }

  for (const chiave of Object.keys(json)) {
    if (!CHIAVI_DATI_AMMESSE.includes(chiave)) {
      errori.push(
        `${file}: chiave non ammessa "${chiave}" (ammesse: ${CHIAVI_DATI_AMMESSE.join(", ")})`
      );
    }
  }

  if (json.layout !== LAYOUT_ARTICOLO) {
    errori.push(`${file}: "layout" deve essere "${LAYOUT_ARTICOLO}"`);
  }
}

// CONTROLLO ESPLICITO: parte a ogni build, indipendentemente dalle collezioni.
// Se trova anche un solo problema, la build si interrompe.
function controllaArticoli() {
  if (!fs.existsSync(CARTELLA_ARTICOLI)) return; // nessun articolo ancora: ok

  const errori = [];
  const visti = new Map(); // id -> file

  for (const nome of fs.readdirSync(CARTELLA_ARTICOLI)) {
    const file = path.join(CARTELLA_ARTICOLI, nome);
    if (!fs.statSync(file).isFile()) continue;
    if (nome === ".gitkeep") continue;

    // Unico file di dati ammesso: controllato a parte
    if (nome === FILE_DATI_AMMESSO) {
      controllaFileDati(file, errori);
      continue;
    }

    if (!nome.endsWith(".md")) {
      errori.push(`${file}: file non ammesso (sono permessi solo file .md)`);
      continue;
    }

    const fm = leggiFrontMatter(fs.readFileSync(file, "utf8"));
    if (!fm) {
      errori.push(`${file}: intestazione (front matter) mancante o non valida`);
      continue;
    }

    const { dati, grezzi } = fm;

    // 1. ID valido
    if (!dati.id || !ID_VALIDO.test(dati.id)) {
      errori.push(`${file}: ID mancante o non valido`);
    } else if (visti.has(dati.id)) {
      // 2. ID duplicato
      errori.push(
        `${file}: ID duplicato (${dati.id}), già usato in ${visti.get(dati.id)}`
      );
    } else {
      visti.set(dati.id, file);
    }

    // 3. Approvazione esplicita
    if (grezzi.approvato !== "true") {
      errori.push(`${file}: articolo NON approvato (serve "approvato: true")`);
    }

    // 4. Titolo e categoria
    if (!dati.titolo) errori.push(`${file}: titolo mancante`);
    if (!dati.categoria) errori.push(`${file}: categoria mancante`);
  }

  if (errori.length > 0) {
    throw new Error(
      "[TECHPULSE] BUILD INTERROTTA. Controlli di sicurezza falliti:\n - " +
        errori.join("\n - ")
    );
  }
}

export default function (eleventyConfig) {
  // SICUREZZA: parte SEMPRE all'inizio di ogni build.
  // Se fallisce, nessun file del sito viene prodotto.
  eleventyConfig.on("eleventy.before", () => {
    controllaArticoli();
  });

  // SICUREZZA: niente HTML grezzo dentro gli articoli
  eleventyConfig.setLibrary(
    "md",
    markdownIt({ html: false, linkify: true, typographer: true })
  );

  // Copia la cartella grafica nel sito
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Filtri per le date in italiano
  eleventyConfig.addFilter("dataIt", (d) =>
    new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Rome",
    }).format(new Date(d))
  );
  eleventyConfig.addFilter("dataIso", (d) => new Date(d).toISOString());

  // Collezione articoli: seconda difesa, oltre al controllo esplicito.
  eleventyConfig.addCollection("articoli", (api) => {
    const articoli = api.getFilteredByGlob("src/articoli/*.md");
    const visti = new Set();

    for (const a of articoli) {
      const file = a.inputPath;
      const id = a.data.id;

      if (!id || !ID_VALIDO.test(id)) {
        throw new Error(`[TECHPULSE] ID mancante o non valido in ${file}`);
      }
      if (visti.has(id)) {
        throw new Error(`[TECHPULSE] ID duplicato (${id}) in ${file}`);
      }
      visti.add(id);

      if (a.data.approvato !== true) {
        throw new Error(`[TECHPULSE] Articolo NON approvato in ${file}`);
      }
      if (!a.data.titolo || !a.data.categoria) {
        throw new Error(`[TECHPULSE] Titolo o categoria mancanti in ${file}`);
      }
    }

    return articoli.sort((x, y) => y.date - x.date);
  });

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    // SICUREZZA: il testo degli articoli non viene eseguito come modello
    markdownTemplateEngine: false,
    htmlTemplateEngine: "njk",
    // Necessario finché il sito sta su nomeutente.github.io/techpulse-ai/
    pathPrefix: "/techpulse-ai/",
  };
}
