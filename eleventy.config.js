const fs = require("fs");
const path = require("path");
const markdownIt = require("markdown-it");

const ID_VALIDO = /^tp-\d{8}-[a-f0-9]{6}$/;
const CARTELLA_ARTICOLI = "src/articoli";
const FILE_DATI_AMMESSO = "articoli.json";
const LAYOUT_ARTICOLO = "articolo.njk";

function leggiFrontMatter(contenuto) {
  const match = contenuto.match(/^---\r?\n([\s\S]*?)\r?\n---/);

  if (!match) {
    return null;
  }

  const dati = {};

  for (const riga of match[1].split(/\r?\n/)) {
    const campo = riga.match(/^([a-zA-Z_][a-zA-Z0-9_]*):\s*(.*)$/);

    if (campo) {
      dati[campo[1]] = campo[2].trim().replace(/^["']|["']$/g, "");
    }
  }

  return dati;
}

function controllaFileDati(percorso, errori) {
  try {
    const dati = JSON.parse(fs.readFileSync(percorso, "utf8"));

    if (
      !dati ||
      typeof dati !== "object" ||
      Array.isArray(dati) ||
      Object.keys(dati).length !== 1 ||
      dati.layout !== LAYOUT_ARTICOLO
    ) {
      errori.push(
        `${FILE_DATI_AMMESSO}: è consentita soltanto la proprietà layout con valore "${LAYOUT_ARTICOLO}".`
      );
    }
  } catch {
    errori.push(`${FILE_DATI_AMMESSO}: JSON non valido.`);
  }
}

function controllaArticoli() {
  if (!fs.existsSync(CARTELLA_ARTICOLI)) {
    return;
  }

  const file = fs.readdirSync(CARTELLA_ARTICOLI);
  const errori = [];
  const idVisti = new Set();

  for (const nomeFile of file) {
    const percorso = path.join(CARTELLA_ARTICOLI, nomeFile);

    if (nomeFile === FILE_DATI_AMMESSO) {
      controllaFileDati(percorso, errori);
      continue;
    }

    if (nomeFile === ".gitkeep") {
      continue;
    }

    if (!nomeFile.endsWith(".md")) {
      errori.push(`${nomeFile}: formato non consentito.`);
      continue;
    }

    const contenuto = fs.readFileSync(percorso, "utf8");
    const dati = leggiFrontMatter(contenuto);

    if (!dati) {
      errori.push(`${nomeFile}: front matter mancante o non valido.`);
      continue;
    }

    if (!ID_VALIDO.test(dati.id || "")) {
      errori.push(`${nomeFile}: ID non valido.`);
    } else if (idVisti.has(dati.id)) {
      errori.push(`${nomeFile}: ID duplicato (${dati.id}).`);
    } else {
      idVisti.add(dati.id);
    }

    if (dati.approvato !== "true") {
      errori.push(`${nomeFile}: articolo non approvato.`);
    }

    if (!dati.titolo) {
      errori.push(`${nomeFile}: titolo mancante.`);
    }

    if (!dati.categoria) {
      errori.push(`${nomeFile}: categoria mancante.`);
    }
  }

  if (errori.length) {
    throw new Error(
      "Controllo articoli fallito:\n- " + errori.join("\n- ")
    );
  }
}

module.exports = function (eleventyConfig) {
  eleventyConfig.on("eleventy.before", () => {
    controllaArticoli();
  });

  eleventyConfig.addFilter("dataIt", (d) =>
    new Intl.DateTimeFormat("it-IT", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Rome",
    }).format(new Date(d))
  );

  eleventyConfig.addFilter("dataIso", (d) =>
    new Date(d).toISOString()
  );

  eleventyConfig.addFilter("perCategoria", (lista, nomeCategoria) =>
    (lista || []).filter(
      (articolo) => articolo.data.categoria === nomeCategoria
    )
  );

  eleventyConfig.addCollection("articoli", (collectionApi) =>
    collectionApi
      .getFilteredByGlob("src/articoli/*.md")
      .sort((a, b) => b.date - a.date)
  );

  eleventyConfig.setLibrary(
    "md",
    markdownIt({
      html: false,
      breaks: true,
      linkify: true,
    })
  );

  return {
    dir: {
      input: "src",
      includes: "_includes",
      data: "_data",
      output: "_site",
    },
    pathPrefix: "/techpulse-ai/",
  };
};
