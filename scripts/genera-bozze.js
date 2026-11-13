const fs = require("fs");

const {
  caricaConfig,
  leggiJson,
  scriviJson,
  configAi,
  telegramConfigurato,
  PERCORSI,
} = require("./lib/config");
const { raccogliNotizie } = require("./lib/notizie");
const { chiediJson } = require("./lib/ai");
const {
  generaId,
  validaArticolo,
  scriviBozza,
  leggiBozza,
  percorsoBozza,
} = require("./lib/articoli");
const { inviaBozza, inviaMessaggio } = require("./lib/telegram");
const {
  dataRoma,
  escapeHtml,
  log,
  tronca,
} = require("./lib/util");

const SISTEMA_SELEZIONE = [
  "Sei il caporedattore di NEXORA, magazine italiano di tecnologia.",
  "Scegli le notizie più rilevanti per un pubblico italiano, scartando duplicati,",
  "contenuti promozionali, rumor non confermati e temi fuori argomento",
  "(sport, cronaca, politica non tecnologica).",
  "Rispondi esclusivamente con JSON valido, senza testo fuori dal JSON.",
].join(" ");

const SISTEMA_SCRITTURA = [
  "Sei un giornalista italiano specializzato in tecnologia e scrivi per NEXORA.",
  "Scrivi in italiano corretto, in modo chiaro, asciutto e verificabile.",
  "Usi soltanto le informazioni contenute nella notizia fornita:",
  "non inventi cifre, citazioni, nomi o date e non aggiungi dettagli di tua iniziativa.",
  "Rispondi esclusivamente con JSON valido, senza testo fuori dal JSON.",
].join(" ");

function promptSelezione(candidati, quanti, titoliRecenti) {
  const notizie = candidati
    .map(
      (notizia, indice) =>
        `${indice + 1}. [${notizia.fonte}] ${notizia.titolo}\n   ${tronca(notizia.sommario, 320)}`
    )
    .join("\n\n");

  const recenti = titoliRecenti.length
    ? titoliRecenti.map((titolo) => `- ${titolo}`).join("\n")
    : "- (nessuno)";

  return [
    `Oggi è ${dataRoma()}. Devi scegliere esattamente ${quanti} notizie da trasformare in articoli.`,
    "",
    "Criteri: rilevanza per il pubblico italiano, autorevolezza della fonte, attualità,",
    "varietà di categorie e assenza di sovrapposizioni con gli argomenti già trattati.",
    "",
    "Argomenti già trattati di recente (non riproporli):",
    recenti,
    "",
    "Notizie disponibili:",
    notizie,
    "",
    "Rispondi con questo formato esatto:",
    `{"scelti":[{"n":1,"motivo":"perché è rilevante"}]}`,
    `Scegli ${quanti} notizie, con "n" compreso tra 1 e ${candidati.length}.`,
  ].join("\n");
}

function promptScrittura(notizia, config, titoliRecenti) {
  const categorie = config.nomiCategorie.join(", ");
  const recenti = titoliRecenti.length
    ? titoliRecenti.map((titolo) => `- ${titolo}`).join("\n")
    : "- (nessuno)";

  return [
    "Scrivi un articolo originale a partire da questa notizia.",
    "",
    `Titolo: ${notizia.titolo}`,
    `Fonte: ${notizia.fonte} (${notizia.data.toISOString().slice(0, 10)})`,
    `Sommario: ${notizia.sommario || "(non disponibile)"}`,
    `URL della notizia: ${notizia.url}`,
    "",
    "Requisiti:",
    `- titolo: tra 40 e 95 caratteri, informativo, senza clickbait e senza punto finale`,
    "- sottotitolo: massimo 180 caratteri, spiega perché la notizia conta",
    `- categoria: una sola, esattamente tra queste: ${categorie}`,
    `- corpo: markdown tra ${config.paroleMinime} e ${config.paroleMassime} parole;`,
    '  inizia con un paragrafo di apertura senza titolo, poi 2 o 3 sezioni con "## ",',
    "  chiudi con un paragrafo di contesto; niente elenchi puntati se non indispensabili;",
    "  non ripetere il titolo dentro il corpo e non inserire una sezione fonti",
    "- fonti: almeno una, usando l'URL e il nome della fonte indicati sopra",
    "- note_verifica: una o due frasi su cosa è confermato dalla fonte e cosa resta da verificare",
    "",
    "Argomenti già trattati di recente (mantieni un taglio diverso):",
    recenti,
    "",
    "Rispondi con questo formato esatto:",
    '{"titolo":"...","sottotitolo":"...","categoria":"...","corpo":"...","fonti":[{"titolo":"...","url":"..."}],"note_verifica":"..."}',
  ].join("\n");
}

function indiceScelto(elemento) {
  if (typeof elemento === "number") return elemento;
  if (!elemento || typeof elemento !== "object") return null;
  const valore = elemento.n ?? elemento.indice ?? elemento.index ?? elemento.posizione;
  const numero = Number(valore);
  return Number.isFinite(numero) ? numero : null;
}

function normalizzaSelezione(risposta, totale, quanti) {
  const elenco = Array.isArray(risposta)
    ? risposta
    : risposta.scelti ||
      risposta.scelte ||
      risposta.selezionati ||
      risposta.notizie ||
      [];

  const indici = [];

  for (const elemento of elenco) {
    const numero = indiceScelto(elemento);
    if (numero && numero >= 1 && numero <= totale && !indici.includes(numero)) {
      indici.push(numero);
    }
  }

  return indici.slice(0, quanti);
}

function titoliRecenti(archivio, quanti) {
  return (archivio.pubblicati || [])
    .slice(-quanti)
    .reverse()
    .map((articolo) => articolo.titolo);
}

/** Toglie dallo stato le bozze il cui file non esiste più. */
function ripulisciStato(stato) {
  const prima = (stato.bozze || []).length;

  stato.bozze = (stato.bozze || []).filter(
    (bozza) => bozza.stato !== "in-attesa" || fs.existsSync(percorsoBozza(bozza.id))
  );

  if (stato.bozze.length !== prima) {
    log(`rimosse ${prima - stato.bozze.length} bozze senza file`);
  }
}

/**
 * Se una notifica non è mai arrivata (Telegram non raggiungibile), la rimanda:
 * una bozza approvabile non deve restare invisibile.
 */
async function recuperaNotifiche(stato) {
  const senzaNotifica = (stato.bozze || []).filter(
    (bozza) => bozza.stato === "in-attesa" && !bozza.messageId
  );

  if (!senzaNotifica.length) return [];

  const errori = [];

  for (const bozza of senzaNotifica) {
    try {
      const letto = leggiBozza(bozza.id);
      const messaggio = await inviaBozza({
        id: bozza.id,
        ...letto.data,
        corpo: letto.content,
      });
      bozza.messageId = messaggio.message_id;
      log(`notifica reinviata per ${bozza.id}`);
    } catch (errore) {
      errori.push(`${bozza.id}: ${errore.message}`);
    }
  }

  scriviJson(PERCORSI.statoBozze, stato);
  return errori;
}

async function avvisaErrore(errore) {
  try {
    await inviaMessaggio(
      `⚠️ <b>Redazione AI: errore</b>\n<code>${escapeHtml(
        tronca(errore.message, 500)
      )}</code>`
    );
  } catch {
    log("impossibile avvisare su Telegram (credenziali mancanti o rete assente)");
  }
}

function avvisoGithub(testo) {
  log(testo);
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::warning::${testo}`);
}

async function main() {
  if (!telegramConfigurato()) {
    avvisoGithub(
      "Telegram non configurato: aggiungi i secret TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID."
    );
    return;
  }

  try {
    configAi();
  } catch (errore) {
    avvisoGithub(errore.message);
    return;
  }

  const config = caricaConfig();
  const archivio = leggiJson(PERCORSI.archivio, { notizie: [], pubblicati: [] });
  const stato = leggiJson(PERCORSI.statoBozze, { bozze: [] });

  ripulisciStato(stato);
  const erroriRecupero = await recuperaNotifiche(stato);
  erroriRecupero.forEach((errore) => log("notifica non recuperata:", errore));

  const oggi = dataRoma();
  const pubblicatiOggi = (archivio.pubblicati || []).filter(
    (articolo) => dataRoma(new Date(articolo.pubblicatoIl)) === oggi
  ).length;
  const inAttesa = (stato.bozze || []).filter(
    (bozza) => bozza.stato === "in-attesa"
  ).length;

  const daProdurre = Math.min(
    config.maxPerEsecuzione,
    Math.max(0, config.obiettivoGiornaliero - pubblicatiOggi - inAttesa)
  );

  log(
    `oggi: ${pubblicatiOggi} pubblicati, ${inAttesa} in attesa, obiettivo ${config.obiettivoGiornaliero} → ${daProdurre} bozze da produrre`
  );

  if (daProdurre === 0) {
    log("obiettivo coperto: nessuna nuova bozza in questa esecuzione");
    return;
  }

  const { notizie, errori } = await raccogliNotizie(config, archivio);
  errori.forEach((errore) => log("fonte ignorata:", errore));

  if (!notizie.length) {
    await inviaMessaggio(
      `ℹ️ <b>Redazione AI</b>\nNessuna notizia nuova nelle ultime ${config.finestraNotizieOre} ore: non ho bozze da proporti.`
    );
    return;
  }

  const candidati = notizie.slice(0, config.articoliDaProporre);
  const recenti = titoliRecenti(archivio, config.titoliRecentiDaEvitare);

  const selezione = await chiediJson({
    sistema: SISTEMA_SELEZIONE,
    utente: promptSelezione(candidati, daProdurre, recenti),
    maxTokens: 800,
    temperatura: 0.3,
  });

  let indici = normalizzaSelezione(selezione, candidati.length, daProdurre);

  if (!indici.length) {
    log("selezione AI non valida: uso le notizie più recenti");
    indici = candidati.slice(0, daProdurre).map((_, posizione) => posizione + 1);
  }

  const creati = [];

  for (const indice of indici) {
    const notizia = candidati[indice - 1];

    let articolo = await chiediJson({
      sistema: SISTEMA_SCRITTURA,
      utente: promptScrittura(notizia, config, recenti),
      maxTokens: 4000,
      temperatura: 0.6,
    });

    let problemi = validaArticolo(articolo, config);

    if (problemi.length) {
      log(`bozza da correggere (${notizia.titolo}):`, problemi.join("; "));

      articolo = await chiediJson({
        sistema: SISTEMA_SCRITTURA,
        utente: [
          promptScrittura(notizia, config, recenti),
          "",
          "La risposta precedente non rispettava questi requisiti:",
          ...problemi.map((problema) => `- ${problema}`),
          "",
          "Riscrivi l'articolo correggendo tutti i problemi indicati.",
        ].join("\n"),
        maxTokens: 4000,
        temperatura: 0.6,
      });

      problemi = validaArticolo(articolo, config);
    }

    if (problemi.length) {
      log(`bozza scartata (${notizia.titolo}):`, problemi.join("; "));
      continue;
    }

    const id = generaId();
    scriviBozza(articolo, id);
    const bozza = leggiBozza(id);

    const statoBozza = {
      id,
      titolo: bozza.data.titolo,
      categoria: bozza.data.categoria,
      creatoIl: new Date().toISOString(),
      stato: "in-attesa",
      messageId: null,
      fonte: notizia.url,
    };

    archivio.notizie.push({
      chiave: notizia.chiave,
      chiaveTitolo: notizia.chiaveTitolo,
      titolo: notizia.titolo,
      url: notizia.url,
      fonte: notizia.fonte,
      vistoIl: new Date().toISOString(),
    });

    stato.bozze.push(statoBozza);
    creati.push({ id, statoBozza, dati: bozza.data, corpo: bozza.content });

    log(`bozza pronta: ${id} — ${bozza.data.titolo}`);
  }

  // Archivio limitato alle ultime notizie, per non farlo crescere all'infinito.
  archivio.notizie = (archivio.notizie || []).slice(-800);

  // Lo stato viene salvato prima delle notifiche: se Telegram non risponde,
  // le bozze restano registrate e vengono reinviate alla prossima esecuzione.
  scriviJson(PERCORSI.archivio, archivio);
  scriviJson(PERCORSI.statoBozze, stato);

  const erroriNotifica = [];

  for (const creato of creati) {
    try {
      const messaggio = await inviaBozza({
        id: creato.id,
        titolo: creato.dati.titolo,
        sottotitolo: creato.dati.sottotitolo,
        categoria: creato.dati.categoria,
        corpo: creato.corpo,
        fonti: creato.dati.fonti,
      });

      creato.statoBozza.messageId = messaggio.message_id;
      log(`notifica Telegram inviata per ${creato.id}`);
    } catch (errore) {
      erroriNotifica.push(`${creato.id}: ${errore.message}`);
      log(`notifica non inviata per ${creato.id}: ${errore.message}`);
    }
  }

  scriviJson(PERCORSI.statoBozze, stato);

  if (!creati.length) {
    await inviaMessaggio(
      "ℹ️ <b>Redazione AI</b>\nHo trovato notizie, ma nessuna è passata ai controlli editoriali. Riprovo alla prossima esecuzione."
    );
    return;
  }

  try {
    await inviaMessaggio(
      [
        `✅ <b>${creati.length} ${
          creati.length === 1 ? "bozza pronta" : "bozze pronte"
        }</b> in attesa di approvazione.`,
        "",
        ...creati.map(
          (creato) =>
            `• ${escapeHtml(creato.dati.titolo)} (${escapeHtml(creato.dati.categoria)})`
        ),
        "",
        `Oggi: ${pubblicatiOggi} pubblicati, ${inAttesa + creati.length} in attesa su un obiettivo di ${config.obiettivoGiornaliero}.`,
      ].join("\n")
    );
  } catch (errore) {
    erroriNotifica.push(`riepilogo: ${errore.message}`);
  }

  log(`completato: ${creati.length} bozze create`);

  if (erroriNotifica.length) {
    throw new Error(
      `notifiche Telegram non riuscite, verranno reinviate: ${erroriNotifica.join("; ")}`
    );
  }
}

main().catch(async (errore) => {
  console.error(errore);
  await avvisaErrore(errore);
  process.exit(1);
});
