const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const matter = require("gray-matter");

const { PERCORSI } = require("./config");
const { contaParole, giornoCompatto } = require("./util");

function generaId(data = new Date()) {
  return `tp-${giornoCompatto(data)}-${crypto.randomBytes(3).toString("hex")}`;
}

function normalizzaCorpo(corpo) {
  const righe = String(corpo ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/^#\s+.+\n+/, "")
    .split("\n");

  const risultato = [];

  for (const riga of righe) {
    if (/^#{2,3}\s/.test(riga) && risultato.length && risultato[risultato.length - 1].trim() !== "") {
      risultato.push("");
    }
    risultato.push(riga);
  }

  return risultato.join("\n").trim();
}

/**
 * Controlli editoriali bloccanti: se un articolo non li supera non viene
 * proposto, così non arriva mai una bozza inadeguata su Telegram.
 */
function validaArticolo(articolo, config) {
  const errori = [];
  const titolo = String(articolo?.titolo ?? "").trim();
  const sottotitolo = String(articolo?.sottotitolo ?? "").trim();
  const categoria = String(articolo?.categoria ?? "").trim();
  const corpo = normalizzaCorpo(articolo?.corpo);
  const note = String(articolo?.note_verifica ?? "").trim();
  const fonti = Array.isArray(articolo?.fonti) ? articolo.fonti : [];

  if (titolo.length < 25 || titolo.length > 120) {
    errori.push(`titolo: lunghezza ${titolo.length}, attesa tra 25 e 120 caratteri`);
  }

  if (sottotitolo.length > 220) {
    errori.push(`sottotitolo: ${sottotitolo.length} caratteri, massimo 220`);
  }

  if (!config.nomiCategorie.includes(categoria)) {
    errori.push(
      `categoria: "${categoria}" non valida, deve essere una tra ${config.nomiCategorie.join(", ")}`
    );
  }

  const parole = contaParole(corpo);

  if (parole < config.paroleMinime) {
    errori.push(`corpo: ${parole} parole, minimo ${config.paroleMinime}`);
  }

  if (parole > Math.round(config.paroleMassime * 1.25)) {
    errori.push(`corpo: ${parole} parole, massimo ${config.paroleMassime}`);
  }

  if (!fonti.length) {
    errori.push("fonti: almeno una fonte è obbligatoria");
  }

  for (const fonte of fonti) {
    const url = String(fonte?.url ?? "").trim();
    if (!/^https?:\/\/\S+$/i.test(url)) {
      errori.push(`fonti: URL non valido ("${url}")`);
    }
    if (!String(fonte?.titolo ?? "").trim()) {
      errori.push("fonti: ogni fonte deve avere un titolo");
    }
  }

  if (note.length < 20) {
    errori.push("note_verifica: serve una nota di verifica di almeno 20 caratteri");
  }

  return errori;
}

function frontMatter(articolo, id, approvato) {
  return {
    id,
    titolo: String(articolo.titolo).trim(),
    sottotitolo: String(articolo.sottotitolo ?? "").trim(),
    categoria: String(articolo.categoria).trim(),
    date: new Date(),
    approvato,
    fonti: (articolo.fonti || []).map((fonte) => ({
      titolo: String(fonte.titolo ?? "").trim(),
      url: String(fonte.url ?? "").trim(),
    })),
    note_verifica: String(articolo.note_verifica ?? "").trim(),
  };
}

function scriviBozza(articolo, id) {
  fs.mkdirSync(PERCORSI.bozze, { recursive: true });
  const percorso = path.join(PERCORSI.bozze, `${id}.md`);
  const contenuto = matter.stringify(
    normalizzaCorpo(articolo.corpo) + "\n",
    frontMatter(articolo, id, false)
  );
  fs.writeFileSync(percorso, contenuto);
  return percorso;
}

function percorsoBozza(id) {
  return path.join(PERCORSI.bozze, `${id}.md`);
}

function leggiBozza(id) {
  const percorso = percorsoBozza(id);

  if (!fs.existsSync(percorso)) {
    throw new Error(`bozza ${id} non trovata in _redazione/bozze`);
  }

  return matter(fs.readFileSync(percorso, "utf8"));
}

/** Sposta la bozza tra gli articoli pubblicati, marcandola come approvata. */
function promuoviBozza(id) {
  const bozza = leggiBozza(id);
  const dati = { ...bozza.data, approvato: true, date: new Date() };

  fs.mkdirSync(PERCORSI.articoli, { recursive: true });
  const destinazione = path.join(PERCORSI.articoli, `${id}.md`);
  fs.writeFileSync(destinazione, matter.stringify(bozza.content, dati));
  fs.unlinkSync(percorsoBozza(id));

  return { percorso: destinazione, dati, corpo: bozza.content };
}

function scartaBozza(id) {
  const percorso = percorsoBozza(id);
  if (fs.existsSync(percorso)) fs.unlinkSync(percorso);
}

module.exports = {
  generaId,
  normalizzaCorpo,
  validaArticolo,
  scriviBozza,
  leggiBozza,
  promuoviBozza,
  scartaBozza,
  percorsoBozza,
};
