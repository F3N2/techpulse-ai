/* Illustrazioni degli articoli: curve di livello in SVG.
   Usate solo per gli articoli senza copertina PNG (per esempio quelli
   scritti a mano prima dell'arrivo delle copertine automatiche). */

const { anelli } = require("./forme");

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

function generaIllustrazione(seme, forma) {
  const disegno = anelli({ seme, forma, larghezza: 320, altezza: 200 });
  const linee = disegno.map((anello, indice) => {
    const livello = indice + 1;
    const opacita = (0.2 + (livello / disegno.length) * 0.7).toFixed(2);
    const spessore = livello % 4 === 0 ? "1.4" : "0.8";

    return `<path d="${percorsoChiuso(anello)}" stroke-width="${spessore}" stroke-opacity="${opacita}"/>`;
  });

  return (
    '<svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice" ' +
    'role="presentation" focusable="false">' +
    '<g fill="none" stroke="currentColor" stroke-linejoin="round" vector-effect="non-scaling-stroke">' +
    linee.join("") +
    "</g></svg>"
  );
}

module.exports = { generaIllustrazione };
