/* NEXORA — scelta del tema.
   Nessuna raccolta dati: salva solo il nome del tema nel browser. */
(function () {
  var CHIAVE = "nexora-tema";
  var TEMI = ["chiaro", "scuro", "lettura"];
  var scelto = null;

  try {
    scelto = window.localStorage.getItem(CHIAVE);
  } catch (errore) {
    scelto = null;
  }

  if (TEMI.indexOf(scelto) === -1) scelto = "scuro";

  // Impostato subito, prima del render, per evitare il lampeggio del tema.
  document.documentElement.setAttribute("data-tema", scelto);

  function sincronizzaRadio(valore) {
    var radio = document.querySelector('input[name="tema"][value="' + valore + '"]');
    if (radio) radio.checked = true;
  }

  function applica(valore) {
    document.documentElement.setAttribute("data-tema", valore);

    try {
      window.localStorage.setItem(CHIAVE, valore);
    } catch (errore) {
      /* navigazione privata: il tema resta valido solo per questa pagina */
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    sincronizzaRadio(scelto);

    var opzioni = document.querySelectorAll('input[name="tema"]');
    Array.prototype.forEach.call(opzioni, function (radio) {
      radio.addEventListener("change", function () {
        if (radio.checked) applica(radio.value);
      });
    });
  });
})();
