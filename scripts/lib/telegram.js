const { configTelegram, baseTelegram } = require("./config");
const { escapeHtml, pulisciMarkdown, tronca } = require("./util");

async function chiama(metodo, corpo) {
  const { token } = configTelegram();

  const risposta = await fetch(`${baseTelegram()}/bot${token}/${metodo}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
    signal: AbortSignal.timeout(30000),
  });

  const dati = await risposta.json().catch(() => ({}));

  if (!risposta.ok || dati.ok !== true) {
    throw new Error(
      `Telegram ${metodo}: ${dati.description || `HTTP ${risposta.status}`}`
    );
  }

  return dati.result;
}

function messaggioBozza(bozza) {
  const righe = [
    `🆕 <b>Bozza pronta</b> · <i>${escapeHtml(bozza.categoria)}</i>`,
    "",
    `<b>${escapeHtml(bozza.titolo)}</b>`,
  ];

  if (bozza.sottotitolo) {
    righe.push(`<i>${escapeHtml(bozza.sottotitolo)}</i>`);
  }

  righe.push("", escapeHtml(tronca(pulisciMarkdown(bozza.corpo), 700)));

  if (bozza.fonti && bozza.fonti.length) {
    const elenco = bozza.fonti.map((fonte) => fonte.titolo || fonte.url).join(" · ");
    righe.push("", `🔗 <i>${escapeHtml(elenco)}</i>`);
  }

  righe.push(
    "",
    `🆔 <code>${escapeHtml(bozza.id)}</code>`,
    "",
    "<b>Pubblicare questo articolo?</b>"
  );

  return righe.join("\n");
}

async function inviaBozza(bozza) {
  const { chatId } = configTelegram();

  return chiama("sendMessage", {
    chat_id: chatId,
    text: messaggioBozza(bozza),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Pubblica", callback_data: `ok:${bozza.id}` },
          { text: "❌ Scarta", callback_data: `no:${bozza.id}` },
        ],
      ],
    },
  });
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

async function modificaMessaggio(messageId, testo) {
  const { chatId } = configTelegram();

  return chiama("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text: testo,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  });
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
  inviaMessaggio,
  modificaMessaggio,
  leggiAggiornamenti,
  eliminaMessaggio,
  rispondiCallback,
};
