/* Codificatore PNG minimale (RGBA a 8 bit), senza dipendenze:
   Node fornisce solo la compressione zlib. */

const zlib = require("zlib");

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

const TABELLA_CRC = new Int32Array(256);

for (let n = 0; n < 256; n += 1) {
  let c = n;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  TABELLA_CRC[n] = c;
}

function crc32(contenuto) {
  let crc = -1;

  for (let i = 0; i < contenuto.length; i += 1) {
    crc = TABELLA_CRC[(crc ^ contenuto[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ -1) >>> 0;
}

function blocco(tipo, dati) {
  const lunghezza = Buffer.alloc(4);
  lunghezza.writeUInt32BE(dati.length, 0);

  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dati]);

  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo), 0);

  return Buffer.concat([lunghezza, corpo, crc]);
}

function codificaPng(larghezza, altezza, rgba) {
  const intestazione = Buffer.alloc(13);
  intestazione.writeUInt32BE(larghezza, 0);
  intestazione.writeUInt32BE(altezza, 4);
  intestazione[8] = 8; // bit per canale
  intestazione[9] = 6; // RGBA
  intestazione[10] = 0;
  intestazione[11] = 0;
  intestazione[12] = 0;

  const riga = larghezza * 4;
  const grezzo = Buffer.alloc((riga + 1) * altezza);

  for (let y = 0; y < altezza; y += 1) {
    // Il primo byte di ogni riga è il filtro: 0 = nessuno.
    rgba.copy(grezzo, y * (riga + 1) + 1, y * riga, (y + 1) * riga);
  }

  const compresso = zlib.deflateSync(grezzo, { level: 9 });

  return Buffer.concat([
    FIRMA,
    blocco("IHDR", intestazione),
    blocco("IDAT", compresso),
    blocco("IEND", Buffer.alloc(0)),
  ]);
}

module.exports = { codificaPng };
