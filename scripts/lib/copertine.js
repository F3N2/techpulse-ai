/* Copertine: illustrazioni a curve di livello disegnate su un PNG.
   Servono a dare a ogni notizia un'immagine propria, senza fotografie
   di repertorio né immagini generate da modelli visuali. */

const { anelli, formaDa } = require("./forme");
const { codificaPng } = require("./png");

const LARGHEZZA = 1200;
const ALTEZZA = 600;
const SFONDO = [18, 25, 16]; // #121910
const INCHIOSTRO = [118, 185, 0]; // #76B900

function creaTela(larghezza, altezza, sfondo) {
  const dati = Buffer.alloc(larghezza * altezza * 4);

  for (let i = 0; i < larghezza * altezza; i += 1) {
    const posizione = i * 4;
    dati[posizione] = sfondo[0];
    dati[posizione + 1] = sfondo[1];
    dati[posizione + 2] = sfondo[2];
    dati[posizione + 3] = 255;
  }

  return dati;
}

function mescola(dati, posizione, colore, copertura) {
  if (copertura <= 0) return;

  const alpha = copertura > 1 ? 1 : copertura;
  const inverso = 1 - alpha;

  dati[posizione] = Math.round(dati[posizione] * inverso + colore[0] * alpha);
  dati[posizione + 1] = Math.round(dati[posizione + 1] * inverso + colore[1] * alpha);
  dati[posizione + 2] = Math.round(dati[posizione + 2] * inverso + colore[2] * alpha);
}

/** Tratto con bordo morbido: la distanza dal segmento diventa la copertura. */
function disegnaSegmento(dati, larghezza, altezza, x1, y1, x2, y2, raggio, colore, opacita) {
  const minimoX = Math.max(0, Math.floor(Math.min(x1, x2) - raggio - 1));
  const massimoX = Math.min(larghezza - 1, Math.ceil(Math.max(x1, x2) + raggio + 1));
  const minimoY = Math.max(0, Math.floor(Math.min(y1, y2) - raggio - 1));
  const massimoY = Math.min(altezza - 1, Math.ceil(Math.max(y1, y2) + raggio + 1));

  const dx = x2 - x1;
  const dy = y2 - y1;
  const lunghezzaQuadrata = dx * dx + dy * dy || 1;

  for (let y = minimoY; y <= massimoY; y += 1) {
    for (let x = minimoX; x <= massimoX; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      let t = ((px - x1) * dx + (py - y1) * dy) / lunghezzaQuadrata;
      if (t < 0) t = 0;
      else if (t > 1) t = 1;

      const distanzaX = px - (x1 + t * dx);
      const distanzaY = py - (y1 + t * dy);
      const distanza = Math.sqrt(distanzaX * distanzaX + distanzaY * distanzaY);

      const copertura = Math.min(1, Math.max(0, raggio + 0.5 - distanza));

      if (copertura > 0) {
        mescola(dati, (y * larghezza + x) * 4, colore, copertura * opacita);
      }
    }
  }
}

function generaCopertina({ seme, forma, larghezza = LARGHEZZA, altezza = ALTEZZA }) {
  const disegno = anelli({
    seme,
    forma,
    larghezza,
    altezza,
    livelli: 16,
    punti: 96,
  });

  const tela = creaTela(larghezza, altezza, SFONDO);

  disegno.forEach((anello, indice) => {
    const livello = indice + 1;
    const opacita = 0.22 + (livello / disegno.length) * 0.68;
    const spessore = livello % 4 === 0 ? 1.5 : 0.9;

    for (let i = 0; i < anello.length; i += 1) {
      const [x1, y1] = anello[i];
      const [x2, y2] = anello[(i + 1) % anello.length];
      disegnaSegmento(tela, larghezza, altezza, x1, y1, x2, y2, spessore, INCHIOSTRO, opacita);
    }
  });

  return codificaPng(larghezza, altezza, tela);
}

function formaCopertina(testo) {
  return formaDa(testo);
}

module.exports = { generaCopertina, formaCopertina, LARGHEZZA, ALTEZZA };
