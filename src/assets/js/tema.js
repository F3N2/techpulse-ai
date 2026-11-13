/* NEXORA — passaggio tra tema scuro e chiaro.
   Nessuna raccolta dati: salva solo il nome del tema nel browser. */
(function () {
  var CHIAVE = "nexora-tema";
  var scelto = null;

  try {
    scelto = window.localStorage.getItem(CHIAVE);
  } catch (errore) {
    scelto = null;
  }

  if (scelto !== "chiaro" && scelto !== "scuro") scelto = "scuro";

  // Impostato subito, prima del render, per evitare il lampeggio del tema.
  document.documentElement.setAttribute("data-tema", scelto);

  function temaAttuale() {
    return document.documentElement.getAttribute("data-tema") === "chiaro"
      ? "chiaro"
      : "scuro";
  }

  function aggiornaPulsante() {
    var pulsante = document.getElementById("tema-toggle");
    if (!pulsante) return;

    var chiaro = temaAttuale() === "chiaro";
    var etichetta = chiaro ? "Passa al tema scuro" : "Passa al tema chiaro";

    pulsante.setAttribute("aria-pressed", chiaro ? "true" : "false");
    pulsante.setAttribute("aria-label", etichetta);
    pulsante.setAttribute("title", etichetta);
  }

  function applica(valore) {
    document.documentElement.setAttribute("data-tema", valore);

    try {
      window.localStorage.setItem(CHIAVE, valore);
    } catch (errore) {
      /* navigazione privata: il tema resta valido solo per questa pagina */
    }

    aggiornaPulsante();
  }

  document.addEventListener("DOMContentLoaded", function () {
    aggiornaPulsante();

    var pulsante = document.getElementById("tema-toggle");
    if (!pulsante) return;

    pulsante.addEventListener("click", function () {
      applica(temaAttuale() === "chiaro" ? "scuro" : "chiaro");
    });
  });
})();
