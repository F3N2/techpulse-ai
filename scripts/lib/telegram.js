const fs = require("fs");
const path = require("path");

const { configTelegram, baseTelegram, PERCORSI } = require("./config");
const { escapeHtml, pulisciMarkdown, tronca } = require("./util");

async function chiama(metodo, corpo) {
  const { token } = configTelegram();

  const risposta = await fetch(`${baseTelegram()}/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30000),
  });

  return leggiRisposta(metodo, risposta);
}

/** Telegram accetta l'immagine solo in multipart: niente JSON qui. */
async function chiamaModulo(metodo, modulo) {
  const { token } = configTelegram();

  const risposta = await fetch(`${baseTelegram()}/bot${token}/${metodo}`, {
    method: "POST",
    body: modulo,
    signal: AbortSignal.timeout(60000),
  });

  return leggiRisposta(metodo, risposta);
}

async function leggiRisposta(metodo, risposta) {
  const dati = await risposta.json().catch(() => ({}));

  if (!risposta.ok || dati.ok !== true) {
    throw new Error(
      `Telegram ${metodo}: ${dati.description || `HTTP ${risposta.status}`}`
    );
  }

  return dati.result;
}

function tastieraBozza(id) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Pubblica", callback_data: `ok:${id}` },
        { text: "❌ Scarta", callback_data: `no:${id}` },
      ],
      [{ text: "🔄 Nuova copertina", callback_data: `rig:${id}` }],
    ],
  };
}

/**
 * Didascalia pensata per stare sotto la foto: Telegram ferma le didascalie a
 * 1024 caratteri, quindi il testo è più corto del messaggio senza immagine.
 */
function messaggioBozza(bozza, opzioni = {}) {
  const perFoto = Boolean(opzioni.perFoto);
  const righe = [
    `🆕 <b>Bozza pronta</b> · <i>${escapeHtml(bozza.categoria)}</i>`,
    "",
    `<b>${escapeHtml(bozza.titolo)}</b>`,
  ];

  if (bozza.sottotitolo) {
    righe.push(
      `<i>${escapeHtml(tronca(bozza.sottotitolo, perFoto ? 150 : 220))}</i>`
    );
  }

  righe.push(
    "",
    escapeHtml(tronca(pulisciMarkdown(bozza.corpo), perFoto ? 280 : 700))
  );

  if (bozza.fonti && bozza.fonti.length) {
    const elenco = bozza.fonti
      .map((fonte) => fonte.titolo || fonte.url)
      .join(" · ");
    righe.push("", `🔗 <i>${escapeHtml(tronca(elenco, perFoto ? 120 : 300))}</i>`);
  }

  righe.push(
    "",
    "🖼️ <i>Copertina generata con la notizia: puoi approvarla o chiederne un'altra.</i>",
    "",
    `🆔 <code>${escapeHtml(bozza.id)}</code>`,
    "",
    "<b>Pubblicare questo articolo?</b>"
  );

  return righe.join("\n");
}

function percorsoCopertina(id) {
  return path.join(PERCORSI.copertineBozze, `${id}.png`);
}

function moduloFoto(id, percorso, didascalia) {
  const modulo = new FormData();

  modulo.append("chat_id", configTelegram().chatId);
  modulo.append("caption", didascalia);
  modulo.append("parse_mode", "HTML");
  modulo.append("reply_markup", JSON.stringify(tastieraBozza(id)));
  modulo.append(
    "photo",
    new Blob([fs.readFileSync(percorso)], { type: "image/png" }),
    `${id}.png`
  );

  return modulo;
}

async function inviaBozza(bozza) {
  const percorso = percorsoCopertina(bozza.id);

  if (fs.existsSync(percorso)) {
    return chiamaModulo(
      "sendPhoto",
      moduloFoto(bozza.id, percorso, messaggioBozza(bozza, { perFoto: true }))
    );
  }

  // Senza copertina la bozza si può comunque approvare.
  return chiama("sendMessage", {
    chat_id: configTelegram().chatId,
    text: messaggioBozza(bozza),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: tastieraBozza(bozza.id),
  });
}

/** Sostituisce la foto di un messaggio già inviato, mantenendo i pulsanti. */
async function modificaFoto(messageId, percorso, didascalia, id) {
  const modulo = new FormData();

  modulo.append("chat_id", configTelegram().chatId);
  modulo.append("message_id", String(messageId));
  modulo.append(
    "media",
    JSON.stringify({
      type: "photo",
      media: "attach://copertina",
      caption: didascalia,
      parse_mode: "HTML",
    })
  );
  modulo.append("reply_markup", JSON.stringify(tastieraBozza(id)));
  modulo.append(
    "copertina",
    new Blob([fs.readFileSync(percorso)], { type: "image/png" }),
    `${id}.png`
  );

  return chiamaModulo("editMessageMedia", modulo);
}

async function inviaMessaggio(testo) {
  const { chatId } = configTelegram();

  return chiama("sendMessage", {
    chat_id: chatId,
    text: testo,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
}

/**
 * Un messaggio con foto non ha testo: in quel caso si modifica la didascalia,
 * altrimenti Telegram risponde con un errore.
 */
async function modificaMessaggio(messageId, testo) {
  const { chatId } = configTelegram();

  try {
    return await chiama("editMessageText", {
      chat_id: chatId,
      message_id: messageId,
      text: testo,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    });
  } catch (errore) {
    return chiama("editMessageCaption", {
      chat_id: chatId,
      message_id: messageId,
      caption: testo,
      parse_mode: "HTML",
    });
  }
}

/** Legge in un colpo solo i clic sui pulsanti e i messaggi di testo ricevuti. */
async function leggiAggiornamenti() {
  const aggiornamenti = await chiama("getUpdates", {
    allowed_updates: ["callback_query", "message"],
    limit: 50,
    timeout: 0,
  });

  const callback = aggiornamenti
    .filter((aggiornamento) => aggiornamento.callback_query)
    .map((aggiornamento) => ({
      callbackId: aggiornamento.callback_query.id,
      dati: String(aggiornamento.callback_query.data || ""),
      messageId: aggiornamento.callback_query.message?.message_id,
      chatId: aggiornamento.callback_query.message?.chat?.id,
    }));

  const messaggi = aggiornamenti
    .filter((aggiornamento) => aggiornamento.message)
    .map((aggiornamento) => ({
      messageId: aggiornamento.message.message_id,
      chatId: aggiornamento.message.chat?.id,
      testo: String(aggiornamento.message.text || "").trim(),
      daBot: Boolean(aggiornamento.message.from?.is_bot),
      rispostaATesto: String(
        aggiornamento.message.reply_to_message?.text || ""
      ),
      rispostaADaBot: Boolean(aggiornamento.message.reply_to_message?.from?.is_bot),
    }));

  return { callback, messaggi };
}

async function eliminaMessaggio(messageId) {
  const { chatId } = configTelegram();

  return chiama("deleteMessage", {
    chat_id: chatId,
    message_id: messageId,
  });
}

async function rispondiCallback(callbackId, testo) {
  return chiama("answerCallbackQuery", {
    callback_query_id: callbackId,
    text: tronca(testo, 190),
    show_alert: false,
  });
}

module.exports = {
  chiama,
  messaggioBozza,
  inviaBozza,
  modificaFoto,
  inviaMessaggio,
  modificaMessaggio,
  leggiAggiornamenti,
  eliminaMessaggio,
  rispondiCallback,
};
