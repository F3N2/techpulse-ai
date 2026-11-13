// Dati del sito.
// L'URL pubblico segue il nome del repository GitHub: così, se il repository
// viene rinominato, la prossima build punta da sola al nuovo indirizzo Pages.
const repository = process.env.GITHUB_REPOSITORY || "F3N2/nexora";
const [proprietario, nomeRepository] = repository.split("/");

module.exports = {
  nome: "NEXORA",
  slogan: "Il magazine italiano che spiega l'intelligenza artificiale",
  descrizione:
    "NEXORA è il magazine italiano che spiega l'intelligenza artificiale, la tecnologia e le startup senza rumore: notizie selezionate, fonti sempre indicate, una tabella di strumenti utili scelti dalla redazione.",
  lingua: "it",
  url: `https://${proprietario.toLowerCase()}.github.io/${nomeRepository}`,
  email: "DA_COMPLETARE",
  titolare: "DA_COMPLETARE",
  sedeLegale: "",
  partitaIva: "",
  numeroRea: "",
  ultimoAggiornamentoLegale: "13 novembre 2026",
};
