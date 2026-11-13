const { XMLParser } = require("fast-xml-parser");
const { impronta, normalizza, pulisci, tronca, log } = require("./util");

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@",
  trimValues: true,
  processEntities: true,
});

const INTESTAZIONI = {
  "User-Agent":
    "Mozilla/5.0 (compatible; Faro-Redazione/1.0; +https://github.com)",
  Accept: "*/*",
};

function elenco(valore) {
  if (valore == null) return [];
  return Array.isArray(valore) ? valore : [valore];
}

function testoDi(nodo) {
  if (nodo == null) return "";
  if (typeof nodo === "string" || typeof nodo === "number") return String(nodo);
  if (Array.isArray(nodo)) return testoDi(nodo[0]);
  if (typeof nodo === "object") {
    if (nodo["#text"] != null) return String(nodo["#text"]);
    if (nodo["@href"] != null) return String(nodo["@href"]);
  }
  return "";
}

function linkDi(nodo) {
  if (nodo == null) return "";
  if (Array.isArray(nodo)) {
    const alternativo = nodo.find(
      (voce) => !voce || !voce["@rel"] || voce["@rel"] === "alternate"
    );
    return linkDi(alternativo ?? nodo[0]);
  }
  if (typeof nodo === "string") return nodo.trim();
  if (typeof nodo === "object") {
    return String(nodo["@href"] ?? nodo["#text"] ?? "").trim();
  }
  return "";
}

function dataDi(...candidati) {
  for (const candidato of candidati) {
    const testo = testoDi(candidato);
    if (!testo) continue;
    const data = new Date(testo);
    if (!Number.isNaN(data.getTime())) return data;
  }
  return null;
}

/** Scarta le voci promozionali (coupon, offerte, sponsorizzazioni) tipiche dei feed. */
function sembraPromozionale(titolo, paroleEscluse) {
  if (!Array.isArray(paroleEscluse) || !paroleEscluse.length) return false;
  const titoloNormalizzato = ` ${normalizza(titolo)} `;

  return paroleEscluse.some((parola) => {
    const chiave = normalizza(parola);
    return chiave.length > 2 && titoloNormalizzato.includes(` ${chiave} `);
  });
}

function estraiVoci(xml, fonte) {
  const documento = parser.parse(xml);
  const canale = documento.rss && documento.rss.channel;

  if (canale) {
    return elenco(canale.item).map((voce) => ({
      titolo: pulisci(testoDi(voce.title)),
      url: linkDi(voce.link),
      sommario: pulisci(
        testoDi(voce.description) || testoDi(voce["content:encoded"])
      ),
      data: dataDi(voce.pubDate, voce["dc:date"]),
      fonte: fonte.nome,
      lingua: fonte.lingua || "en",
    }));
  }

  const feed = documento.feed;

  if (feed) {
    return elenco(feed.entry).map((voce) => ({
      titolo: pulisci(testoDi(voce.title)),
      url: linkDi(voce.link),
      sommario: pulisci(testoDi(voce.summary) || testoDi(voce.content)),
      data: dataDi(voce.published, voce.updated),
      fonte: fonte.nome,
      lingua: fonte.lingua || "en",
    }));
  }

  throw new Error("formato XML non riconosciuto (né RSS né Atom)");
}

async function scaricaFonte(fonte, timeoutMs = 20000) {
  const risposta = await fetch(fonte.url, {
    headers: INTESTAZIONI,
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });

  if (!risposta.ok) {
    throw new Error(`HTTP ${risposta.status}`);
  }

  const xml = await risposta.text();
  return estraiVoci(xml, fonte);
}

/**
 * Raccoglie le notizie delle fonti configurate, scarta quelle fuori finestra,
 * già viste o duplicate, e le ordina dalla più recente.
 */
async function raccogliNotizie(config, archivio) {
  const daQuando = Date.now() - config.finestraNotizieOre * 3600 * 1000;
  const chiaviViste = new Set(
    (archivio.notizie || []).map((notizia) => notizia.chiave)
  );
  const titoliVisti = new Set(
    (archivio.notizie || []).map((notizia) => notizia.chiaveTitolo)
  );
  const titoliPubblicati = new Set(
    (archivio.pubblicati || []).map((articolo) => normalizza(articolo.titolo))
  );

  const letture = await Promise.all(
    config.fonti.map(async (fonte) => {
      try {
        return { fonte: fonte.nome, voci: await scaricaFonte(fonte) };
      } catch (errore) {
        return { fonte: fonte.nome, errore: errore.message };
      }
    })
  );

  const errori = [];
  const notizie = [];
  const vistiInQuestoGiro = new Set();

  for (const lettura of letture) {
    if (lettura.errore) {
      errori.push(`${lettura.fonte}: ${lettura.errore}`);
      continue;
    }

    for (const voce of lettura.voci) {
      if (!voce.titolo || voce.titolo.length < 20) continue;
      if (!/^https?:\/\//i.test(voce.url)) continue;
      if (!voce.data || voce.data.getTime() < daQuando) continue;
      if (sembraPromozionale(voce.titolo, config.paroleEscluse)) continue;

      const chiave = impronta(voce.url);
      const chiaveTitolo = impronta(normalizza(voce.titolo));

      if (chiaviViste.has(chiave) || titoliVisti.has(chiaveTitolo)) continue;
      if (vistiInQuestoGiro.has(chiaveTitolo)) continue;
      if (titoliPubblicati.has(normalizza(voce.titolo))) continue;

      vistiInQuestoGiro.add(chiaveTitolo);
      notizie.push({ ...voce, chiave, chiaveTitolo });
    }
  }

  notizie.sort((a, b) => b.data - a.data);

  log(
    `notizie raccolte: ${notizie.length} (finestra ${config.finestraNotizieOre}h, ${letture.length} fonti)`
  );

  return {
    notizie: notizie.map((notizia) => ({
      ...notizia,
      sommario: tronca(notizia.sommario, 700),
    })),
    errori,
  };
}

module.exports = { raccogliNotizie, estraiVoci, scaricaFonte, sembraPromozionale };
