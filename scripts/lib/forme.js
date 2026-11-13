/* Geometria delle copertine: curve di livello chiuse, una forma diversa
   per ogni articolo. Usata sia dall'SVG del sito sia dal PNG per Telegram. */

const crypto = require("crypto");

const FORME = ["onde", "cresta", "nodo", "picco"];

function numeroIniziale(valore) {
  return parseInt(
    crypto.createHash("sha1").update(String(valore)).digest("hex").slice(0, 8),
    16
  );
}

function generatoreCasuale(valore) {
  let stato = numeroIniziale(valore) || 1;

  return () => {
    stato = (stato * 1664525 + 1013904223) >>> 0;
    return stato / 4294967296;
  };
}

function normalizzaForma(valore) {
  const forma = String(valore || "").trim().toLowerCase();
  return FORME.includes(forma) ? forma : "onde";
}

/** Forma stabile per un articolo: la stessa notizia ha sempre la stessa. */
function formaDa(testo) {
  return FORME[numeroIniziale(testo) % FORME.length];
}

/**
 * Anelli concentrici in coordinate del riquadro richiesto.
 * Il rilievo cambia con la forma scelta, così le copertine non si somigliano.
 */
function anelli({
  seme,
  forma,
  larghezza = 320,
  altezza = 200,
  livelli = 16,
  punti = 96,
}) {
  const tipo = normalizzaForma(forma);
  const casuale = generatoreCasuale(seme);
  const fase = [0, 1, 2, 3].map(() => casuale() * Math.PI * 2);
  const ampiezza = [
    0.1 + casuale() * 0.08,
    0.05 + casuale() * 0.05,
    0.03 + casuale() * 0.04,
    0.02 + casuale() * 0.03,
  ];
  const centro = {
    x: 160 + (casuale() - 0.5) * 8,
    y: 100 + (casuale() - 0.5) * 6,
  };

  const grezzi = [];

  for (let livello = 1; livello <= livelli; livello += 1) {
    const base = 18 + livello * 4.6;
    const deriva = livello * 0.035;
    const anello = [];

    for (let k = 0; k < punti; k += 1) {
      const angolo = (k / punti) * Math.PI * 2;
      let rilievo =
        1 +
        ampiezza[0] * Math.sin(3 * angolo + fase[0] + deriva) +
        ampiezza[1] * Math.sin(5 * angolo + fase[1] - deriva * 0.8) +
        ampiezza[2] * Math.sin(7 * angolo + fase[2] + deriva * 0.4) +
        ampiezza[3] * Math.sin(2 * angolo + fase[3]);

      if (tipo === "cresta") {
        rilievo +=
          0.18 * Math.sin(angolo - Math.PI / 2 + fase[0] * 0.2) +
          0.05 * Math.sin(4 * angolo + fase[3]);
      } else if (tipo === "nodo") {
        rilievo += 0.3 * Math.cos(2 * angolo + fase[1]);
      } else if (tipo === "picco") {
        rilievo += 0.42 * Math.pow(Math.max(0, Math.cos(angolo - fase[2])), 5);
      }

      const raggio = base * rilievo;

      anello.push([
        centro.x + Math.cos(angolo) * raggio * 1.12,
        centro.y + Math.sin(angolo) * raggio * 0.78,
      ]);
    }

    grezzi.push(anello);
  }

  let massimoX = 1;
  let massimoY = 1;

  for (const anello of grezzi) {
    for (const [x, y] of anello) {
      massimoX = Math.max(massimoX, Math.abs(x - centro.x));
      massimoY = Math.max(massimoY, Math.abs(y - centro.y));
    }
  }

  const scalaX = ((larghezza / 2) * 0.94) / massimoX;
  const scalaY = ((altezza / 2) * 0.94) / massimoY;

  return grezzi.map((anello) =>
    anello.map(([x, y]) => [
      larghezza / 2 + (x - centro.x) * scalaX,
      altezza / 2 + (y - centro.y) * scalaY,
    ])
  );
}

module.exports = { FORME, anelli, formaDa, normalizzaForma };
