# BizScan Pro — scanner biglietti da visita

Legge un biglietto da visita (foto o PDF) e ne estrae i dati di contatto e
azienda in forma strutturata, usando Claude.

Nato su Emergent, **staccato il 27 luglio 2026** per essere gestito in proprio
e collegato al CRM Experviser.

---

## Cosa fa

| Endpoint | A cosa serve |
|---|---|
| `POST /api/scan` | Un biglietto singolo: fronte, e retro se c'e' |
| `POST /api/scan/batch` | Un PDF intero, elaborato pagina per pagina in background (piu' biglietti per pagina) |
| `GET /api/scan/batch/{job_id}` | Avanzamento del PDF in lavorazione |
| `GET /api/health` | Stato del servizio |

Campi estratti per ogni biglietto: nome/secondo nome/cognome piu' il nome come
scritto in originale, ruolo e reparto, tre telefoni distinti (cellulare,
diretto, ufficio), due email, LinkedIn e sito personale, nome commerciale,
brand, ragione sociale e sito dell'azienda, indirizzo con CAP e paese
separati, settore, **punteggio di affidabilita' 0-100** e note dell'AI su cio'
che era ambiguo o illeggibile.

## Avvio

```bash
cd backend
python3 -m venv .venv && ./.venv/bin/pip install -r requirements.txt
cp env.example .env      # poi metti la tua ANTHROPIC_API_KEY dentro .env
./.venv/bin/uvicorn server:app --reload --port 8001
```

Frontend:

```bash
cd frontend && yarn install && yarn start
```

## Dove stanno i dati

**Nel browser, non sul server.** Il backend fa solo estrazione AI e non
salva nulla di permanente; i contatti vivono in IndexedDB (database
`BizScanPro`) sul dispositivo dove hai scansionato.

Conseguenze da conoscere:

- i dati sono legati a quel browser e a quell'indirizzo web: non si
  sincronizzano fra dispositivi;
- se pulisci i dati di navigazione, spariscono;
- i PDF in lavorazione stanno in memoria del processo: se riavvii il backend,
  i lavori in corso si perdono (i contatti gia' salvati nel browser no).

Prima di qualunque intervento, **fai un backup**: pagina Backup → esporta il
JSON completo (progetti, contatti, aziende, impostazioni). L'export CSV della
pagina Export perde le relazioni ed e' un ripiego.

## Cosa e' cambiato staccandolo da Emergent

- L'estrazione passa dall'**SDK Anthropic ufficiale** invece che dalla
  libreria `emergentintegrations`; la chiave e' `ANTHROPIC_API_KEY` al posto
  di `EMERGENT_LLM_KEY`.
- Si usa l'**output strutturato**: il modello non puo' rispondere fuori
  schema. Prima la risposta veniva ripulita a mano tagliando i recinti
  markdown, e bastava una frase di cortesia in piu' per far fallire la
  lettura.
- Rimossi gli artefatti della piattaforma, incluso un `.gitconfig` che
  attribuiva i commit a `github@emergent.sh`.
- Tolte le dipendenze MongoDB, che erano dichiarate ma mai usate.

## Da fare

- Collegamento al CRM Experviser come plugin: i contatti scansionati devono
  entrare passando dal motore di identita' e deduplicazione del CRM, mai per
  inserimento diretto. La deduplicazione interna di questo strumento
  (pagina Duplicati) non va portata dentro: deciderebbe cose diverse dal CRM
  sullo stesso contatto.
- CORS: oggi accetta qualunque origine (`allow_origins=["*"]` con
  `allow_credentials=True`, combinazione da restringere prima di esporlo).
