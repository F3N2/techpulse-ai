const path = require("path");

const RADICE = path.resolve(__dirname, "..", "..");

const PERCORSI = {
  radice: RADICE,
  redazione: path.join(RADICE, "_redazione"),
  bozze: path.join(RADICE, "_redazione", "bozze"),
  archivio: path.join(RADICE, "_redazione", "archivio.json"),
  statoBozze: path.join(RADICE, "_redazione", "bozze.json"),
  credenziali: path.join(RADICE, "_redazione", "credenziali.enc"),
  apiTool: path.join(RADICE, "_redazione", "api-tool.enc"),
  config: path.join(RADICE, "_redazione", "config.json"),
  articoli: path.join(RADICE, "src", "articoli"),
  categorie: path.join(RADICE, "src", "_data", "categorie.json"),
  tools: path.join(RADICE, "src", "_data", "tools.json"),
};

module.exports = { RADICE, PERCORSI };
