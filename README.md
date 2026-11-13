# NEXORA

Magazine italiano sull'intelligenza artificiale, costruito con
Eleventy e pubblicato su GitHub Pages, con una redazione automatica che propone
almeno **4 articoli al giorno** e li pubblica **solo dopo la tua approvazione su Telegram**.

## Come funziona

```
feed RSS (11 fonti)
      │
      ▼
GitHub Actions «Redazione AI – genera bozze»  (ogni 3 ore)
  1. scarica le notizie delle ultime 36 ore, scarta duplicati, annunci e notizie già usate
  2. il modello AI sceglie gli argomenti migliori
  3. il modello AI scrive l'articolo in italiano (titolo, sottotitolo, categoria, corpo, fonti, nota di verifica)
  4. controlli editoriali bloccanti (lunghezza, categoria valida, fonti obbligatorie)
  5. bozza salvata in `_redazione/bozze/` + messaggio Telegram con i pulsanti ✅ Pubblica / ❌ Scarta
      │
      ▼
GitHub Actions «Redazione AI – approvazioni e pubblicazione»  (ogni 15 minuti)
  6. legge i tuoi clic su Telegram
  7. ✅ sposta la bozza in `src/articoli/`, ❌ la elimina
  8. costruisce il sito e lo pubblica su GitHub Pages, poi ti conferma su Telegram
```

La redazione produce solo quanto manca all'obiettivo giornaliero: se hai già 4 articoli
pubblicati o in attesa, non genera altro. Se non approvi, non viene pubblicato nulla.

## Configurazione (una volta sola)

### 1. Crea il bot Telegram

1. Apri Telegram, cerca **@BotFather**, invia `/newbot` e segui le istruzioni.
2. Copia il token che ti restituisce (formato `123456789:AA...`).
3. Apri una chat con il tuo nuovo bot e inviagli un messaggio qualsiasi (serve per
   autorizzarlo a scriverti).
4. Ricava il tuo **chat id**: apri nel browser
   `https://api.telegram.org/bot<TOKEN>/getUpdates` e cerca `"chat":{"id":123456789`.
   In alternativa usa @userinfobot.

### 2. Scegli il modello AI

Serve una chiave di un provider compatibile OpenAI. La scelta predefinita è **Z.ai**,
perché i modelli *flash* sono gratuiti e scrivono bene in italiano:

| Provider | Endpoint | Modello predefinito | Costo |
| --- | --- | --- | --- |
| **Z.ai (predefinito)** | `https://api.z.ai/api/paas/v4` | `glm-4.7-flash` | gratuito |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` | a consumo, pochi centesimi al giorno |

Non devi per forza passare da GitHub: **puoi inserire la chiave direttamente su Telegram**
(vedi il punto 5). Qualsiasi altro provider compatibile OpenAI funziona cambiando
`AI_BASE_URL` e `AI_MODEL`.

### 3. Aggiungi i secret su GitHub

Nel repository: **Settings → Secrets and variables → Actions**.

Secret (obbligatori):

| Nome | Valore |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | il token di @BotFather |
| `TELEGRAM_CHAT_ID` | il tuo chat id numerico |
| `AI_API_KEY` | *(facoltativo)* la chiave AI, se preferisci non inserirla da Telegram |

Variabili (facoltative, tab **Variables**):

| Nome | Predefinito | A cosa serve |
| --- | --- | --- |
| `AI_BASE_URL` | `https://api.z.ai/api/paas/v4` | endpoint del provider |
| `AI_MODEL` | `glm-4.7-flash` | modello usato |
| `SITO_URL` | dedotto da `owner.github.io/repo` | base dei link nelle notifiche |

### 4. Abilita GitHub Pages

**Settings → Pages → Source: GitHub Actions.** Il workflow `deploy.yml` pubblica a ogni
push su `main`.

### 5. Inserisci la chiave API da Telegram

Scrivi al tuo bot:

```
/api <la-tua-chiave>
```

Il bot salva la chiave **cifrata** in `_redazione/credenziali.enc`, cancella il tuo
messaggio dalla chat, fa una chiamata di prova e ti risponde se funziona. Poi avvia
subito una generazione di bozze, senza aspettare il cron.

Altri comandi:

| Comando | Effetto |
| --- | --- |
| `/api openai <chiave>` | usa OpenAI invece di Z.ai |
| `/api modello <nome>` | cambia solo il modello, mantenendo la chiave |
| `/api stato` | mostra provider, modello e provenienza della chiave |
| `/api rimuovi` | cancella la chiave salvata |
| `/api` | mostra l'aiuto |

Se il secret `AI_API_KEY` è presente su GitHub, ha la precedenza sulla chiave inserita
da Telegram.

### 6. API separata per i tool (opzionale)

La pagina **Tool** (`/tool/`) elenca gli strumenti scelti dalla redazione. Per far
consigliare al bot quale strumento usare serve una seconda API, indipendente da quella
della redazione: può essere lo stesso provider o un altro, purché compatibile OpenAI.

```
/toolapi <la-tua-chiave>
```

| Comando | Effetto |
| --- | --- |
| `/toolapi url <indirizzo>` | cambia endpoint (default `https://api.openai.com/v1`) |
| `/toolapi modello <nome>` | cambia il modello (default `gpt-4o-mini`) |
| `/toolapi test` | fa una richiesta reale di prova |
| `/toolapi stato` | mostra endpoint, modello e ultime 4 cifre della chiave |
| `/toolapi rimuovi` | cancella chiave ed endpoint |

Con la chiave configurata puoi scrivere in chat:

```
/tool devo riassumere un PDF di 60 pagine
```

Il bot interroga l'API con in contesto la tabella della pagina Tool e risponde con lo
strumento più adatto e i passi per usarlo. La chiave è cifrata in
`_redazione/api-tool.enc` con la chiave derivata dal token del bot; in alternativa puoi
usare i secret GitHub `TOOL_API_KEY`, `TOOL_API_BASE` e `TOOL_API_MODEL`, che hanno la
precedenza.

### 7. Prova la pipeline

Vai in **Actions → Redazione AI – genera bozze → Run workflow**. Dopo pochi secondi
dovresti ricevere su Telegram una o due bozze con i pulsanti. Premi ✅ e attendi fino a
15 minuti: l'articolo comparirà sul sito.

## Comandi locali

```bash
npm install
npm run build                 # costruisce il sito in _site/
npm start                     # anteprima locale su http://localhost:8080/techpulse-ai/

# redazione, con le credenziali in un file .env (mai committarlo)
node --env-file=.env scripts/genera-bozze.js
node --env-file=.env scripts/gestisci-approvazioni.js
```

Il `.env` deve contenere `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`; per l'API dei tool, `TOOL_API_KEY`,
`TOOL_API_BASE` e `TOOL_API_MODEL`. Per provare la logica senza chiavi reali si
può puntare `AI_BASE_URL` e `TELEGRAM_API_BASE` a un server locale che simula le API.

## Impostazioni editoriali

Tutto in `_redazione/config.json`:

| Campo | Significato |
| --- | --- |
| `obiettivoGiornaliero` | articoli al giorno da raggiungere (default 4) |
| `maxPerEsecuzione` | quante bozze al massimo per singola esecuzione |
| `finestraNotizieOre` | finestra temporale delle notizie considerate |
| `paroleMinime` / `paroleMassime` | lunghezza accettata del corpo |
| `titoliRecentiDaEvitare` | quanti titoli recenti passare al modello per evitare ripetizioni |
| `paroleEscluse` | parole che scartano annunci e contenuti promozionali |
| `fonti` | elenco dei feed RSS (nome, url, lingua) |

Le categorie non sono duplicate qui: vengono lette da `src/_data/categorie.json`, così un
articolo con una categoria inesistente viene rifiutato prima dell'approvazione.

## Pubblicare un articolo a mano

Crea `src/articoli/tp-AAAAMMGG-xxxxxx.md` (l'ID deve rispettare `tp-` + 8 cifre + 6
caratteri esadecimali) con questo front matter — il build fallisce se manca qualcosa:

```markdown
---
id: tp-20261113-a1b2c3
titolo: "Titolo dell'articolo"
sottotitolo: "Una riga che spiega perché conta"
categoria: "Intelligenza artificiale"
date: 2026-11-13T09:00:00+01:00
approvato: true
fonti:
  - titolo: "Nome della fonte"
    url: "https://esempio.it/notizia"
note_verifica: "Cosa è confermato e cosa resta da verificare."
---

Testo dell'articolo in markdown.
```

I controlli automatici in `eleventy.config.js` bloccano ID non validi o duplicati,
articoli con `approvato` diverso da `true`, titoli mancanti e categorie mancanti.

## Zona tool

La tabella in `/tool/` si modifica da un solo file, `src/_data/tools.json`: ogni voce ha
`nome`, `categoria`, `descrizione`, `url` e `costo`.

```json
{
  "nome": "ChatGPT",
  "categoria": "Assistenti",
  "descrizione": "L'assistente più diffuso: scrive, riassume, traduce.",
  "url": "https://chatgpt.com",
  "costo": "Freemium"
}
```

Aggiungi la riga e fai commit: la pagina si rigenera da sola, con il conteggio aggiornato.
Gli stessi dati vengono passati all'API dei tool quando scrivi `/tool` su Telegram, così
il bot consiglia solo strumenti che esistono davvero in tabella.

## Struttura

```
_redazione/
  config.json        impostazioni editoriali e fonti RSS
  archivio.json      notizie già viste e articoli pubblicati (evita ripetizioni)
  bozze.json         bozze in attesa di approvazione su Telegram
  bozze/             bozze in markdown, fuori dal sito finché non approvate
scripts/
  genera-bozze.js           raccolta → selezione → scrittura → Telegram
  gestisci-approvazioni.js  clic ✅/❌ → pubblicazione
  lib/                      util, config, notizie (RSS), ai, apiTool, articoli, telegram
src/                        sito Eleventy (pagine, layout, dati, articoli)
  tool.njk                  pagina dei tool
  _data/tools.json          elenco dei tool: una riga per strumento
.github/workflows/
  deploy.yml                pubblica il sito a ogni push su main
  redazione-genera.yml      cron ogni 3 ore
  redazione-approva.yml     cron ogni 15 minuti
```

## Pagine legali: cosa devi completare

Le pagine sono già scritte e collegate nel footer: [Chi siamo](src/chi-siamo.njk),
[Contatti](src/contatti.njk), [Privacy Policy](src/privacy-policy.njk),
[Cookie Policy](src/cookie-policy.njk), [Termini e condizioni](src/termini-e-condizioni.njk),
[Uso dell'intelligenza artificiale](src/informativa-ai.njk).

Ti resta un solo passaggio, in `src/_data/site.json`:

| Campo | Cosa metterci |
| --- | --- |
| `titolare` | il tuo nome e cognome, oppure la ragione sociale |
| `email` | un indirizzo reale, raggiungibile |

Finché restano `DA_COMPLETARE`, ogni pagina legale mostra un avviso giallo di promemoria
(ed è bene non pubblicizzare il sito in quello stato).

Le informative descrivono il sito per come è adesso: nessun cookie, nessuna analisi
statistica, nessun modulo, nessun commento, nessuna pubblicità. Se in futuro aggiungi una
di queste cose, privacy e cookie policy vanno riscritte prima di attivarla.

## Checklist legale: requisito per requisito

| Requisito | Stato nel progetto | Cosa devi fare |
| --- | --- | --- |
| **Privacy policy** (obbligatoria se tratti dati, anche solo un'email) | Presente: `src/privacy-policy.njk`, con titolare, hosting, finalità, base giuridica, conservazione, diritti e Garante | Compila `titolare` ed `email` in `site.json` |
| **Cookie policy** | Presente: `src/cookie-policy.njk` | Nulla: dichiara correttamente che non ci sono cookie; la preferenza del tema è in `localStorage`, non è un cookie e non richiede consenso |
| **Banner cookie** (obbligatorio solo se usi cookie non essenziali) | **Non presente, di proposito**: il sito non usa cookie, analytics, embed o widget di terze parti | Se un giorno aggiungi Analytics, video YouTube o pulsanti social, serve un banner che blocchi i cookie **prima** del consenso e va allentata la CSP |
| **Termini e condizioni** (obbligatori solo per e-commerce o vendita di servizi) | Presenti: `src/termini-e-condizioni.njk`, coprono proprietà intellettuale, marchi di terzi, natura informativa e responsabilità | Restano utili anche senza vendite: sei tu a decidere se tenerli |
| **Dati societari nel footer** (obbligatori con partita IVA) | Campi pronti in `site.json`: `partitaIva`, `sedeLegale`, `numeroRea`; il blocco compare nel footer e nelle pagine legali **solo se valorizzato** | Se hai una P. IVA, compila i tre campi |
| **HTTPS** | Garantito da GitHub Pages, certificato automatico su `*.github.io` | Non disattivare “Enforce HTTPS” in Settings → Pages |
| **Snippet di cookie banner** (Iubenda, Cookiebot…) | Non installati: non servono senza cookie e la CSP blocca gli script di terze parti | Vanno aggiunti solo insieme a cookie non essenziali |
| **Checkbox privacy sui form** | Non ci sono form, newsletter né commenti: nessun dato raccolto dal browser | Se aggiungi un modulo, serve una casella non pre-flaggata per la privacy, una separata per il marketing, e un backend che riceva i dati |
| **Registrazione al Tribunale** (se diventa una testata con ricavi pubblicitari) | Non necessaria per un progetto personale senza ricavi | Da valutare se introduce pubblicità o ne fa un'attività editoriale continuativa |

## Sicurezza

Cosa fa il progetto:

- **La chiave API non è mai in chiaro.** `_redazione/credenziali.enc` è un blob
  AES-256-GCM con salt e IV casuali; la chiave di cifratura è derivata con scrypt
  (N=32768, r=8, p=1) da un segreto che vive solo nei secret di GitHub. I parametri del
  KDF sono registrati nel file, così si possono irrobustire in futuro senza perdere i
  dati esistenti.
- **Il messaggio con la chiave viene cancellato** dalla chat dopo il salvataggio, e il bot
  accetta comandi solo dal tuo `TELEGRAM_CHAT_ID`.
- **Il controllo di sicurezza blocca il deploy** (`npm run sicurezza`): cerca chiavi in
  stile `sk-…`, token di bot, token GitHub e chiavi private in `src/`, `_redazione/` e
  `_site/`, e verifica che nessun file della redazione finisca nel sito pubblicato.
- **Il sito carica un solo script locale**, `src/assets/js/tema.js` (circa 1 KB), che
  serve a ricordare la modalità di lettura scelta e salva solo quel valore nel
  `localStorage`. La Content-Security-Policy dichiarata in `src/_includes/base.njk`
  ammette script solo dallo stesso dominio: nessuna risorsa di terze parti, nessun
  iframe, nessun font o immagine esterna, nessuno stile inline.
- **I secret non sono esposti alle pull request**: i workflow girano solo su schedule e
  dispatch, quindi una PR esterna non può eseguirli né leggerli.
- `_redazione/` è fuori da `src/`, quindi bozze, archivio e credenziali non vengono mai
  copiati in `_site/`.

Cosa **non** può fare nessun progetto di questo tipo, per essere chiari:

- **Il 100% non esiste.** Chi ha accesso ai secret del repository (o può modificare i
  workflow sul branch `main`) può leggere la chiave: è il prezzo di automatizzare da
  GitHub Actions. Tieni il 2FA sull'account GitHub e non dare permessi di scrittura a
  estranei.
- **Il repository è pubblico**, quindi il blob cifrato è visibile a tutti. Non è
  leggibile senza il segreto, ma se ti serve riservatezza anche sul fatto che esista,
  l'unica strada è rendere privato il repository (su GitHub Pages richiede un piano a
  pagamento) o spostare la chiave in un secret e rinunciare all'inserimento da Telegram.
- **GitHub Pages non permette header HTTP personalizzati**: HSTS, `X-Frame-Options` o
  `Content-Security-Policy` come header di risposta non sono impostabili. La CSP via
  `meta` copre i rischi principali (nessuno script ammesso); se un giorno sposti il sito
  su un host che consente header, conviene spostarla lì.
- **Il sito non ha autenticazione né dati utente**, quindi non ci sono account da
  proteggere: è un sito statico pubblico. Il rischio residuo è nella pipeline, non nelle
  pagine.

Se sospetti che la chiave sia stata esposta: revocala dal provider, rigenera il token del
bot con @BotFather e reinserisci la chiave con `/api <chiave>` (il vecchio blob diventa
automaticamente illeggibile).

## Limiti da conoscere

- **I cron di GitHub Actions non sono puntuali**: possono partire con alcuni minuti di
  ritardo (a volte di più sotto carico). Il controllo delle approvazioni è ogni 15 minuti,
  quindi tra il tuo clic e la pubblicazione passa al massimo circa un quarto d'ora.
- **I workflow schedulati si disattivano dopo 60 giorni di inattività del repository**:
  GitHub invia un avviso, basta un commit o un avvio manuale per riattivarli.
- **Il push automatico usa `GITHUB_TOKEN`**: se attivi una protezione del branch `main`
  che richiede pull request, i workflow non potranno committare e la pubblicazione
  fallirà. In quel caso serve un token personale o disattivare la regola.
- **Le fonti vanno scelte con giudizio**: sono state escluse ANSA (il cui feed dichiara
  `FOR PERSONAL USE ONLY`) e Il Sole 24 Ore (contenuti con copyright editoriale). Le fonti
  attuali sono feed ufficiali di aziende e centri di ricerca più testate che non impongono
  limiti espliciti. Prima di aggiungerne una, leggi le sue condizioni d'uso: ogni articolo
  cita e linka la fonte originale e non ne riproduce il testo, ma non basta se il feed
  vieta l'uso non personale.
- **Costi**: ogni bozza comporta due chiamate al modello (selezione + scrittura, più un
  eventuale tentativo di correzione). Con 4 articoli al giorno il consumo resta basso, ma
  dipende dal provider e dal modello scelto.
- **La qualità va verificata**: il modello scrive a partire dal solo sommario del feed e
  dalle indicazioni fornite. La nota di verifica e il pulsante di approvazione esistono
  proprio per questo: nessun articolo va online senza che tu lo abbia letto.
- **La chiave inserita da Telegram è cifrata**, non in chiaro: `_redazione/credenziali.enc`
  è un blob AES-256-GCM la cui chiave deriva dal token del bot (o da `REDAZIONE_SEGRETO`,
  se lo imposti). Chi legge il repository senza quel segreto non può ricavare la chiave.
  Se cambi il token del bot, la chiave salvata diventa illeggibile e va reinserita con
  `/api <chiave>`. I secret di GitHub non vengono mai esposti ai fork, quindi una pull
  request esterna non può usarli.
