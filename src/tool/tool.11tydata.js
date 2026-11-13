// URL dei tool: il nome della cartella resta il titolo del quadrato, ma
// l'indirizzo viene normalizzato (minuscolo, senza accenti, spazi in trattini).
function slug(testo) {
  return String(testo)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

module.exports = {
  eleventyComputed: {
    permalink: (data) => {
      const parti = String(data.page?.filePathStem || "")
        .split("/")
        .filter(Boolean);
      const nome = parti.length >= 3 ? parti[parti.length - 2] : "";

      if (!nome) return data.permalink;

      return `/tool/${slug(nome)}/`;
    },
  },
};
