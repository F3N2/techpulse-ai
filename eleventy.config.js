const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const markdownIt = require("markdown-it");
const CATEGORIE = require("./src/_data/categorie.json");
const { generaIllustrazione } = require("./scripts/lib/illustrazioni");

// Il sito è un sito di progetto di GitHub Pages: il percorso pubblico segue il
// nome del repository, quindi un rename non richiede modifiche al codice.
const NOME_REPOSITORY = (
  process.env.GITHUB_REPOSITORY || "F3N2/nexora"
).split("/")[1];

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
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  eleventyConfig.on("eleventy.before", () => {
    controllaArticoli();
  });

  // Illustrazione a curve di livello, diversa per ogni articolo.
  eleventyConfig.addFilter("illustrazione", (seme) => generaIllustrazione(seme));

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

  // Tempo di lettura stimato: 200 parole al minuto, minimo un minuto.
  eleventyConfig.addFilter("tempoLettura", (testo) => {
    const parole = String(testo || "")
      .replace(/<[^>]*>/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
    const minuti = Math.max(1, Math.round(parole / 200));
    return `${minuti} min di lettura`;
  });

  eleventyConfig.addFilter("urlCategoria", (nome) => {
    const categoria = CATEGORIE.find((c) => c.nome === nome);
    return categoria ? `/${categoria.slug}/` : "/";
  });

  // Articoli da leggere dopo: stessa categoria, escluso quello corrente.
  eleventyConfig.addFilter("correlati", (lista, url, categoria, massimo = 3) =>
    (lista || [])
      .filter(
        (articolo) =>
          articolo.url !== url && articolo.data.categoria === categoria
      )
      .slice(0, massimo)
  );

  // L'elenco è dal più recente: il successivo è il più nuovo, il precedente
  // il più vecchio.
  eleventyConfig.addFilter("vicini", (lista, url) => {
    const elenco = lista || [];
    const indice = elenco.findIndex((articolo) => articolo.url === url);

    if (indice === -1) {
      return { precedente: null, successivo: null };
    }

    return {
      precedente: elenco[indice + 1] || null,
      successivo: elenco[indice - 1] || null,
    };
  });

  // Impronta del contenuto: se il file cambia cambia anche l'URL, così dopo
  // un deploy il browser non continua a usare una copia vecchia dalla cache.
  eleventyConfig.addFilter("impronta", (percorso) =>
    crypto
      .createHash("sha1")
      .update(fs.readFileSync(path.join(__dirname, "src", percorso.replace(/^\//, ""))))
      .digest("hex")
      .slice(0, 8)
  );

  // Zona tool: ogni cartella in src/tool/ diventa un quadrato, e il nome della
  // cartella è il titolo del quadrato. Dentro c'è una pagina index.html.
  eleventyConfig.addCollection("tool", (collectionApi) =>
    collectionApi.getFilteredByGlob("src/tool/*/index.html")
  );

  eleventyConfig.addFilter("nomeCartella", (stem) => {
    const parti = String(stem || "").split("/").filter(Boolean);
    return parti.length >= 3 ? parti[parti.length - 2] : "";
  });

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
    pathPrefix: `/${NOME_REPOSITORY}/`,
  };
};
