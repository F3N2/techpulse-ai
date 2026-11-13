const { configAi } = require("./config");

function estraiJson(testo) {
  const pulito = String(testo ?? "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(pulito);
  } catch {
    // il modello può aggiungere testo attorno al JSON: si prova a isolarlo
  }

  const inizio = pulito.indexOf("{");
  const fine = pulito.lastIndexOf("}");

  if (inizio !== -1 && fine > inizio) {
    try {
      return JSON.parse(pulito.slice(inizio, fine + 1));
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Chiede al modello una risposta JSON. Ritenta sugli errori transitori
 * (limiti di frequenza, errori del server, JSON malformato).
 */
async function chiediJson({
  sistema,
  utente,
  maxTokens = 3000,
  temperatura = 0.5,
  credenziali,
}) {
  const ai = credenziali || configAi();

  const corpo = {
    model: ai.modello,
    temperature: temperatura,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: sistema },
      { role: "user", content: utente },
    ],
  };

  let ultimoErrore = null;

  for (let tentativo = 1; tentativo <= 3; tentativo += 1) {
    try {
      const risposta = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ai.chiave}`,
        },
        body: JSON.stringify(corpo),
        signal: AbortSignal.timeout(ai.timeoutMs || 180000),
      });

      if (!risposta.ok) {
        const dettaglio = (await risposta.text()).slice(0, 300);
        throw new Error(`AI ${risposta.status}: ${dettaglio}`);
      }

      const dati = await risposta.json();
      const contenuto = dati?.choices?.[0]?.message?.content ?? "";
      const json = estraiJson(contenuto);

      if (!json) {
        throw new Error(`risposta non JSON: ${String(contenuto).slice(0, 200)}`);
      }

      return json;
    } catch (errore) {
      ultimoErrore = errore;
      const ritentabile =
        /429|5\d\d|rate|limite|timeout|to fetch|fetch failed|non JSON|ECONNRESET|ETIMEDOUT/i.test(
          errore.message
        );

      if (tentativo === 3 || !ritentabile) break;

      const attesa = 4000 * tentativo;
      console.warn(
        `[redazione] chiamata AI fallita (${errore.message}); nuovo tentativo tra ${attesa} ms`
      );
      await new Promise((risolvi) => setTimeout(risolvi, attesa));
    }
  }

  throw ultimoErrore || new Error("chiamata AI fallita");
}

/**
 * Prova una chiave appena inserita con una richiesta minima:
 * serve a dire subito all'utente se funziona, invece di scoprirlo ore dopo.
 */
async function verificaChiave(credenziali) {
  try {
    const risposta = await chiediJson({
      credenziali,
      sistema: 'Rispondi solo con JSON valido: {"ok":true}',
      utente: "Test di funzionamento. Rispondi con {\"ok\":true}.",
      maxTokens: 40,
      temperatura: 0,
    });

    if (risposta && typeof risposta === "object") return { ok: true };
    return { ok: false, errore: "risposta inattesa dal modello" };
  } catch (errore) {
    return { ok: false, errore: errore.message };
  }
}

module.exports = { chiediJson, estraiJson, verificaChiave };
