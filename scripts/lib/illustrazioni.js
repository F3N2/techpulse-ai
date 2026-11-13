/* Illustrazioni degli articoli: curve di livello generate.
   Ogni articolo ha un rilievo diverso, ricavato dal suo ID, così le immagini
   non richiedono file né fotografie. */

const crypto = require("crypto");

const LIVELLI = 16;
const PUNTI = 96;

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

// Curva chiusa e morbida: Catmull-Rom convertito in cubiche di Bézier.
function percorsoChiuso(punti) {
  const n = punti.length;
  let d = `M${punti[0][0].toFixed(1)} ${punti[0][1].toFixed(1)}`;

  for (let i = 0; i < n; i += 1) {
    const p0 = punti[(i - 1 + n) % n];
    const p1 = punti[i];
    const p2 = punti[(i + 1) % n];
    const p3 = punti[(i + 2) % n];

    const c1x = p1[0] + (p2[0] - p0[0]) / 6;
    const c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6;
    const c2y = p2[1] - (p3[1] - p1[1]) / 6;

    d +=
      `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ` +
      `${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }

  return `${d}Z`;
}

function generaIllustrazione(seme) {
  const casuale = generatoreCasuale(seme || "nexora");
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

  const linee = [];

  for (let livello = 1; livello <= LIVELLI; livello += 1) {
    const base = 18 + livello * 4.6;
    const deriva = livello * 0.035;
    const punti = [];

    for (let k = 0; k < PUNTI; k += 1) {
      const angolo = (k / PUNTI) * Math.PI * 2;
      const rilievo =
        1 +
        ampiezza[0] * Math.sin(3 * angolo + fase[0] + deriva) +
        ampiezza[1] * Math.sin(5 * angolo + fase[1] - deriva * 0.8) +
        ampiezza[2] * Math.sin(7 * angolo + fase[2] + deriva * 0.4) +
        ampiezza[3] * Math.sin(2 * angolo + fase[3]);
      const raggio = base * rilievo;

      punti.push([
        centro.x + Math.cos(angolo) * raggio * 1.12,
        centro.y + Math.sin(angolo) * raggio * 0.78,
      ]);
    }

    const opacita = (0.2 + (livello / LIVELLI) * 0.7).toFixed(2);
    const spessore = livello % 4 === 0 ? "1.4" : "0.8";

    linee.push(
      `<path d="${percorsoChiuso(punti)}" stroke-width="${spessore}" stroke-opacity="${opacita}"/>`
    );
  }

  return (
    '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" ' +
    'role="presentation" focusable="false">' +
    '<g fill="none" stroke="currentColor" stroke-linejoin="round" vector-effect="non-scaling-stroke">' +
    linee.join("") +
    "</g></svg>"
  );
}

module.exports = { generaIllustrazione };
