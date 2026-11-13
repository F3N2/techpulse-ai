const fs = require("fs");

const {
  caricaConfig,
  leggiJson,
  scriviJson,
  configTelegram,
  telegramConfigurato,
  PERCORSI,
  urlArticolo,
} = require("./lib/config");
const { promuoviBozza, scartaBozza } = require("./lib/articoli");
const {
  leggiAggiornamenti,
  rispondiCallback,
  modificaMessaggio,
  inviaMessaggio,
  eliminaMessaggio,
} = require("./lib/telegram");
const {
  PROVIDER,
  PROVIDER_PREDEFINITO,
  leggiCredenziali,
  salvaCredenziali,
  eliminaCredenziali,
  descrizioneProvider,
} = require("./lib/credenziali");
const { verificaChiave } = require("./lib/ai");
const { escapeHtml, log, tronca } = require("./lib/util");

const AIUTO_API = [
  "<b>Configurazione della chiave API</b>",
  "",
  "Invia uno di questi comandi:",
  "",
  `<code>/api &lt;chiave&gt;</code> — salva la chiave con il provider predefinito (${PROVIDER[PROVIDER_PREDEFINITO].nome}, modello ${PROVIDER[PROVIDER_PREDEFINITO].modello}: ${PROVIDER[PROVIDER_PREDEFINITO].nota})`,
  ...Object.entries(PROVIDER)
    .filter(([slug]) => slug !== PROVIDER_PREDEFINITO)
    .map(
      ([slug, preset]) =>
        `<code>/api ${slug} &lt;chiave&gt;</code> — usa ${preset.nome} (${preset.modello}, ${preset.nota})`
    ),
  "<code>/api modello &lt;nome&gt;</code> — cambia solo il modello",
  "<code>/api stato</code> — mostra la configurazione attiva",
  "<code>/api rimuovi</code> — cancella la chiave salvata",
  "",
  "Puoi anche rispondere a questo messaggio con la sola chiave.",
  "",
  "<i>La chiave viene cifrata nel repository e il tuo messaggio viene eliminato.</i>",
].join("\n");

function impostaOutput(nome, valore) {
  if (!process.env.GITHUB_OUTPUT) return;

  try {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `${nome}=${valore}\n`);
  } catch (errore) {
    log(`impossibile scrivere l'output ${nome}: ${errore.message}`);
  }
}

function avvisoGithub(testo) {
  log(testo);
  if (process.env.GITHUB_ACTIONS === "true") console.log(`::warning::${testo}`);
}

async function statoApi() {
  let salvate = null;
  let errore = "";

  try {
    salvate = leggiCredenziali();
  } catch (problema) {
    errore = problema.message;
  }

  const daAmbiente = Boolean(process.env.AI_API_KEY);

  const righe = ["<b>Stato della configurazione</b>", ""];

  if (daAmbiente) {
    righe.push("🔑 Chiave: impostata come secret <code>AI_API_KEY</code> su GitHub.");
    righe.push(`🧠 Modello: <code>${escapeHtml(process.env.AI_MODEL || "(predefinito)")}</code>`);
  } else if (salvate) {
    righe.push(`🔑 Chiave: salvata da Telegram (${escapeHtml(descrizioneProvider(salvate))}).`);
    righe.push(`📅 Inserita il ${escapeHtml(String(salvate.inseritaIl).slice(0, 10))}.`);
  } else {
    righe.push("⚠️ Nessuna chiave API configurata.");
  }

  if (errore) righe.push(`❌ ${escapeHtml(errore)}`);
  if (daAmbiente) righe.push("", "<i>Il secret di GitHub ha la precedenza sulla chiave salvata da Telegram.</i>");

  await inviaMessaggio(righe.join("\n"));
}

async function salvaEVerifica({ chiave, provider, modello }) {
  const credenziali = salvaCredenziali({ chiave, provider, modello });
  const esito = await verificaChiave(credenziali);

  if (esito.ok) {
    await inviaMessaggio(
      [
        "✅ <b>Chiave salvata e verificata</b>",
        "",
        `Provider: <b>${escapeHtml(descrizioneProvider(credenziali))}</b>`,
        "",
        "La redazione la usa da adesso. Avvio subito una generazione di bozze.",
      ].join("\n")
    );
  } else {
    await inviaMessaggio(
      [
        "⚠️ <b>Chiave salvata, ma il test è fallito</b>",
        "",
        `<code>${escapeHtml(tronca(esito.errore, 400))}</code>`,
        "",
        "Controlla di aver copiato la chiave intera. Se il modello non esiste, cambialo con",
        `<code>/api modello &lt;nome&gt;</code>.`,
      ].join("\n")
    );
  }

  return esito.ok;
}

/**
 * Interpreta i comandi /api. Restituisce cosa è cambiato, così il workflow
 * sa se committare e se avviare subito una generazione.
 */
async function gestisciComandoApi(testo) {
  const argomenti = testo.replace(/^\/api(@\w+)?/i, "").trim().split(/\s+/).filter(Boolean);
  const primo = (argomenti[0] || "").toLowerCase();

  if (!argomenti.length) {
    await inviaMessaggio(AIUTO_API);
    return { modifiche: false, chiaveInserita: false, daEliminare: false };
  }

  if (primo === "stato" || primo === "aiuto" || primo === "help") {
    await statoApi();
    return { modifiche: false, chiaveInserita: false, daEliminare: false };
  }

  if (primo === "rimuovi" || primo === "cancella") {
    const rimosse = eliminaCredenziali();
    await inviaMessaggio(
      rimosse
        ? "🗑️ Chiave API cancellata. Per configurarne una nuova: <code>/api &lt;chiave&gt;</code>."
        : "Non c'era nessuna chiave salvata da cancellare."
    );
    return { modifiche: rimosse, chiaveInserita: false, daEliminare: false };
  }

  if (primo === "modello") {
    const nuovoModello = argomenti[1];

    if (!nuovoModello) {
      await inviaMessaggio("Uso: <code>/api modello &lt;nome&gt;</code>");
      return { modifiche: false, chiaveInserita: false, daEliminare: false };
    }

    let salvate = null;

    try {
      salvate = leggiCredenziali();
    } catch (errore) {
      await inviaMessaggio(`❌ ${escapeHtml(errore.message)}`);
      return { modifiche: false, chiaveInserita: false, daEliminare: false };
    }

    if (!salvate) {
      await inviaMessaggio(
        "Prima inserisci la chiave con <code>/api &lt;chiave&gt;</code>, poi potrai cambiare modello."
      );
      return { modifiche: false, chiaveInserita: false, daEliminare: false };
    }

    const ok = await salvaEVerifica({
      chiave: salvate.chiave,
      provider: salvate.provider,
      modello: nuovoModello,
    });

    return { modifiche: true, chiaveInserita: ok, daEliminare: false };
  }

  let provider = PROVIDER_PREDEFINITO;
  let chiave = argomenti[0];

  if (argomenti.length >= 2) {
    provider = primo;
    chiave = argomenti[1];

    if (!PROVIDER[provider]) {
      await inviaMessaggio(
        `❌ Provider sconosciuto: <code>${escapeHtml(provider)}</code>. Disponibili: ${Object.keys(
          PROVIDER
        )
          .map((slug) => `<code>${slug}</code>`)
          .join(", ")}.`
      );
      return { modifiche: false, chiaveInserita: false, daEliminare: true };
    }
  }

  if (chiave.length < 12) {
    await inviaMessaggio(
      "⚠️ La chiave sembra troppo corta: controlla di aver copiato tutto."
    );
    return { modifiche: false, chiaveInserita: false, daEliminare: true };
  }

  const ok = await salvaEVerifica({ chiave, provider });

  return { modifiche: true, chiaveInserita: ok, daEliminare: true };
}

async function gestisciMessaggi(messaggi, chatId) {
  let modifiche = false;
  let chiaveInserita = false;

  for (const messaggio of messaggi) {
    if (String(messaggio.chatId) !== String(chatId) || messaggio.daBot) continue;

    const testo = messaggio.testo || "";
    if (!testo) continue;

    const comandoApi = /^\/api(@\w+)?(\s|$)/i.test(testo);
    const rispostaAllaGuida =
      messaggio.rispostaADaBot &&
      /chiave/i.test(messaggio.rispostaATesto) &&
      !testo.startsWith("/");

    if (!comandoApi && !rispostaAllaGuida) continue;

    const esito = await gestisciComandoApi(
      comandoApi ? testo : `/api ${testo}`
    );

    modifiche = modifiche || esito.modifiche;
    chiaveInserita = chiaveInserita || esito.chiaveInserita;

    if (esito.daEliminare) {
      await eliminaMessaggio(messaggio.messageId).catch(() =>
        log("impossibile eliminare il messaggio con la chiave")
      );
    }
  }

  return { modifiche, chiaveInserita };
}

async function gestisciCallback(callback, chatId, archivio, stato) {
  let modifiche = false;
  let pubblicati = 0;

  for (const risposta of callback) {
    if (String(risposta.chatId) !== String(chatId)) {
      log(`ignoro una risposta da una chat non autorizzata: ${risposta.chatId}`);
      await rispondiCallback(risposta.callbackId, "Chat non autorizzata").catch(
        () => {}
      );
      continue;
    }

    const [azione, id] = risposta.dati.split(":");
    const bozza = (stato.bozze || []).find(
      (voce) => voce.id === id && voce.stato === "in-attesa"
    );

    if (!bozza) {
      await rispondiCallback(
        risposta.callbackId,
        "Questa bozza non è più in attesa"
      ).catch(() => {});
      continue;
    }

    try {
      if (azione === "ok") {
        const articolo = promuoviBozza(id);
        const link = urlArticolo(id);

        archivio.pubblicati = archivio.pubblicati || [];
        archivio.pubblicati.push({
          id,
          titolo: articolo.dati.titolo,
          categoria: articolo.dati.categoria,
          pubblicatoIl: new Date().toISOString(),
          url: link,
        });

        bozza.stato = "pubblicata";
        pubblicati += 1;
        modifiche = true;

        if (bozza.messageId) {
          await modificaMessaggio(
            bozza.messageId,
            [
              "✅ <b>Pubblicato</b>",
              "",
              `<b>${escapeHtml(articolo.dati.titolo)}</b>`,
              `<i>${escapeHtml(articolo.dati.categoria)}</i>`,
              "",
              link.startsWith("http")
                ? `<a href="${escapeHtml(link)}">Apri l'articolo</a>`
                : `Percorso: ${escapeHtml(link)}`,
            ].join("\n")
          ).catch((errore) => log(`modifica messaggio fallita: ${errore.message}`));
        }

        await rispondiCallback(risposta.callbackId, "Articolo pubblicato").catch(
          () => {}
        );
        log(`pubblicato: ${id} — ${articolo.dati.titolo}`);
      } else if (azione === "no") {
        scartaBozza(id);
        bozza.stato = "scartata";
        modifiche = true;

        if (bozza.messageId) {
          await modificaMessaggio(
            bozza.messageId,
            [
              "❌ <b>Bozza scartata</b>",
              "",
              `<b>${escapeHtml(bozza.titolo)}</b>`,
              "",
              "Nessuna pubblicazione. La redazione proporrà altri argomenti.",
            ].join("\n")
          ).catch((errore) => log(`modifica messaggio fallita: ${errore.message}`));
        }

        await rispondiCallback(risposta.callbackId, "Bozza scartata").catch(
          () => {}
        );
        log(`scartata: ${id} — ${bozza.titolo}`);
      } else {
        await rispondiCallback(
          risposta.callbackId,
          "Azione non riconosciuta"
        ).catch(() => {});
      }
    } catch (errore) {
      log(`errore su ${id}: ${errore.message}`);
      await rispondiCallback(
        risposta.callbackId,
        `Errore: ${tronca(errore.message, 150)}`
      ).catch(() => {});
    }
  }

  return { modifiche, pubblicati };
}

async function main() {
  if (!telegramConfigurato()) {
    avvisoGithub(
      "Telegram non configurato: aggiungi i secret TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID."
    );
    impostaOutput("modifiche", "false");
    impostaOutput("pubblicato", "false");
    impostaOutput("chiaveInserita", "false");
    return;
  }

  caricaConfig();

  const archivio = leggiJson(PERCORSI.archivio, { notizie: [], pubblicati: [] });
  const stato = leggiJson(PERCORSI.statoBozze, { bozze: [] });
  const telegram = configTelegram();

  const { callback, messaggi } = await leggiAggiornamenti();

  log(
    `${messaggi.length} messaggi, ${callback.length} clic ricevuti (bozze in attesa: ${
      (stato.bozze || []).length
    })`
  );

  const comandi = await gestisciMessaggi(messaggi, telegram.chatId);
  const esiti = await gestisciCallback(
    callback,
    telegram.chatId,
    archivio,
    stato
  );

  const modifiche = comandi.modifiche || esiti.modifiche;

  if (esiti.modifiche) {
    stato.bozze = (stato.bozze || []).filter(
      (bozza) => bozza.stato === "in-attesa"
    );
    scriviJson(PERCORSI.statoBozze, stato);
    scriviJson(PERCORSI.archivio, archivio);
  }

  if (esiti.pubblicati > 0) {
    await inviaMessaggio(
      [
        `📰 <b>${
          esiti.pubblicati === 1
            ? "1 articolo pubblicato"
            : `${esiti.pubblicati} articoli pubblicati`
        }</b>`,
        "",
        `Restano ${(stato.bozze || []).length} bozze in attesa. Il sito viene aggiornato adesso.`,
      ].join("\n")
    ).catch((errore) => log(`notifica finale fallita: ${errore.message}`));
  }

  impostaOutput("modifiche", modifiche ? "true" : "false");
  impostaOutput("pubblicato", esiti.pubblicati > 0 ? "true" : "false");
  impostaOutput("chiaveInserita", comandi.chiaveInserita ? "true" : "false");
}

main().catch((errore) => {
  console.error(errore);
  process.exit(1);
});
