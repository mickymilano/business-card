# HANDOFF — Business Card Reader

Ultimo aggiornamento: 27 luglio 2026 (seconda sessione)
Chat successiva suggerita: **"business card reader"**

---

## Dove siamo

Lo scanner biglietti (`mickymilano/business-card`, clonato in
`~/Desktop/business-card`) e' stato **staccato da Emergent** ed e' autonomo.
Commit `da5eb5b`, pushato.

Cosa e' cambiato:

- estrazione via **SDK Anthropic ufficiale** (`anthropic==0.120.0`) al posto di
  `emergentintegrations`; chiave `ANTHROPIC_API_KEY` al posto di
  `EMERGENT_LLM_KEY`; modello configurabile con `ANTHROPIC_MODEL`
  (default `claude-sonnet-5`, prima era `claude-sonnet-4-5-20250929` fisso);
- **output strutturato**: il modello non puo' rispondere fuori schema. Prima
  la risposta veniva ripulita a mano tagliando i recinti markdown e bastava
  una frase di cortesia per far fallire l'estrazione;
- schema unico condiviso fra scansione singola e batch PDF (prima i campi
  erano elencati due volte in due prompt diversi);
- rimossi `.emergent/` e un `.gitconfig` che attribuiva i commit a
  `github@emergent.sh`; rimosse le dipendenze MongoDB mai usate.

### Verificato / NON verificato

- Verificato: compila, schema corretto, struttura a posto.
- **NON verificato**: il giro completo verso Anthropic. In locale non c'e' una
  chiave (quella del CRM sta su Render). C'e' gia' un venv pronto in
  `~/Desktop/business-card/.venv` e un `backend/env.example`: basta copiarlo
  in `backend/.env`, metterci la chiave, e provare sul PDF di esempio
  `test_business_cards.pdf` che e' nel repo.

---

## Rischio chiuso: i biglietti gia' scansionati

**Michele ha esportato il backup il 27 luglio 2026.** I contatti scansionati
non vivono piu' solo in IndexedDB (`BizScanPro`) dentro un browser.

Resta da fare, ma senza urgenza: reimportare quel JSON nel CRM come progetto di
scansione con le relative schede. Sono contatti gia' estratti, quindi entrano
come schede in stato "letta" senza immagine, non come biglietti da leggere.

---

## Disegno concordato per l'integrazione nel CRM

Direzione decisa da Michele: **lo scanner spinge verso il CRM** (push, non
pull).

### Il vincolo che decide l'architettura

Le scansioni si fanno in fiera, **con poca o nessuna copertura**. Deve essere
possibile fotografare 40 biglietti in 3 minuti senza aspettare l'AI e senza
rete. Quindi: **catturare e capire vanno separati**.

Conseguenza: lo scanner spinge **l'immagine grezza compressa**, non i campi
gia' estratti. L'estrazione avviene nel CRM. Motivi:

1. l'immagine e' la prova da mostrare accanto ai campi quando l'affidabilita'
   e' bassa;
2. si puo' **rileggere** in futuro con un modello migliore senza riscansionare;
3. riduce la finestra di rischio (l'immagine parte al primo filo di rete,
   senza aspettare un giro AI che con due tacche fallisce);
4. una sola configurazione AI (il CRM ha gia' registro fornitori,
   instradamento per scopo, controllo costi);
5. cattura istantanea.

Contro-argomento onesto: nello scanner l'estrazione gia' funziona, quindi
spostarla e' lavoro. Ma il vincolo offline impone comunque la separazione.

### Modello dati nel CRM — sezione "Scansioni"

- **Progetto** = l'evento/momento in cui i biglietti sono stati raccolti
  (nome, data, luogo, note). Serve anche dopo: fra sei mesi ci si ricorda
  *dove* si e' conosciuta una persona, non come si chiamava.
- **Scheda** = un biglietto: progetto, immagine (riusare `crm_files` /
  `CrmFileService` gia' esistenti), campi estratti, punteggio di affidabilita',
  stato, riferimenti alle entita' create, chiave di idempotenza.

Ciclo di stato: `in coda sul telefono` → `caricata` → `letta` →
`da verificare` → `convertita` / `scartata`.

Le schede sotto una certa affidabilita' restano in "da verificare" e non
diventano contatti da sole.

### Conversione

Una alla volta, tutte, o a selezione → **lead**, **contatto**, oppure
**azienda+contatto**.

**Regola non negoziabile: mai inserimento diretto.** Ogni conversione passa dal
motore di identita' del CRM (`docs/unified-identity-ownership-engine.md`):
prima di creare, dice se la persona esiste gia' e se l'azienda e' gia' nota
per dominio. Altrimenti da una fiera si portano a casa 40 duplicati.

La deduplicazione interna dello scanner (pagina Duplicati) **non va portata
nel CRM**: deciderebbe cose diverse dal motore di identita' sullo stesso
contatto.

Default suggerito: **lead** (chi da' un biglietto in fiera non e' ancora
qualificato), con possibilita' di scegliere altro per scheda o per selezione.

### Dettagli per la poca rete

- ogni scheda ha una **chiave di idempotenza** propria: un invio ritentato non
  crea doppioni;
- caricamento ripartibile, immagini compresse (lo scanner gia' fa scala di
  grigi + JPEG lato client);
- la coda si svuota da sola al ritorno del campo;
- **contatore visibile** "N schede ancora da inviare": il rischio peggiore e'
  credere di aver mandato tutto.

### Conseguenza da mettere in conto

Quando il CRM possiede scansioni/contatti/aziende, nello scanner le pagine
Contatti, Aziende, Duplicati ed Export diventano un doppione destinato a
divergere. Va ridotto a: **progetti, fotocamera, coda di invio**.

---

## Stato: cosa e' gia' costruito lato CRM

Passi 1, 2 e 3 fatti e pushati su `main` (commit `a0d7fa54e`, `5a938cf19`,
`d62ac907d` nel repo Experviser_Crm).

**1. Tabelle** — `migrations/20260727_scan_projects_cards.sql`, agganciata allo
`startCommand` di Render, additiva e transazionale.

- `scan_projects`: nome, data evento, luogo, note. `client_key` unica per
  utente: il progetto puo' nascere offline e il primo invio fa upsert.
- `scan_cards`: `idempotency_key` unica per utente (un reinvio con due tacche
  non crea doppioni), immagine su `crm_files`, output del modello per intero,
  `confidence`, ciclo `uploaded → extracting → read | needs_review → converted |
  discarded | error`, piu' `captured_at` separato da `created_at` (la data e'
  quella dello scatto, non quella di arrivo).
- Le colonne `converted_contact_id/company_id/lead_id` sono registrate nel
  motore di identita': se il record creato viene fuso, la scheda lo segue.

**2. Endpoint push** — `server/routes/scans.ts`, montato su `/api/scans` con
`authenticate`.

| Rotta | Cosa fa |
| --- | --- |
| `POST /api/scans/projects` | crea o restituisce il progetto per `clientKey`; non sovrascrive uno esistente |
| `POST /api/scans/cards` | multipart `front` (+ `back`); reinvio con la stessa `idempotencyKey` → 200 con la scheda esistente, nuova → 201 |
| `POST /api/scans/cards/known` | il telefono manda le chiavi che crede spedite, riceve quelle davvero arrivate |
| `GET /api/scans/projects` | elenco con contatori per stato |
| `GET /api/scans/projects/:id/cards` | schede del progetto |

`CrmFileService.storeUnlinked` archivia l'immagine senza collegarla a nessuna
entita': diventa file di un contatto solo se e quando la scheda viene convertita.

**3. Estrazione server-side** — `server/modules/scans/ScanExtractionService.ts`.
Prompt e schema presi da `backend/server.py`, con un solo elenco di campi.
Output strutturato, `effort: low`, modello da `SCAN_EXTRACTION_MODEL` (default
`claude-sonnet-5`). Sotto soglia di affidabilita' la scheda resta
"da verificare". Rotte: `POST /api/scans/cards/:id/extract` (con `force` per
rileggere) e `POST /api/scans/projects/:id/extract`.

### NON verificato

Nessuna delle rotte e' stata provata contro il DB o contro Anthropic: il
checkout Desktop ha il database disattivato. Compila, i test unitari passano,
lo schema e la migrazione sono coerenti — ma il giro completo va provato su
Render dopo il deploy.

---

## Prossimo passo concreto

1. **Provare il giro su Render**: creare un progetto, spingere una foto,
   lanciare l'estrazione, guardare cosa torna. E' la prima cosa da fare.
2. **UI sezione Scansioni**: elenco progetti, revisione scheda con immagine
   accanto ai campi, conversione. La conversione deve passare dal motore di
   identita' (`docs/unified-identity-ownership-engine.md`), mai inserimento
   diretto: da una fiera si portano a casa 40 duplicati. Default suggerito:
   **lead**.
3. **Worker automatico di lettura**: oggi l'estrazione parte solo su richiesta
   esplicita. Serve un worker con tetto e cadenza, sul modello degli altri
   worker del CRM — mai una chiamata al modello per riga di elenco.
4. **Ridurre lo scanner a client di cattura**: progetti, fotocamera, coda di
   invio. Contatti, Aziende, Duplicati ed Export diventano un doppione
   destinato a divergere.
5. **Reimportare il backup JSON** dei biglietti gia' scansionati.

---

## Contesto utile dal CRM

- Il CRM sta in `~/Desktop/Experviser_Crm` (checkout di Claude) e
  `~/Projects/expercrm/Experviser_Crm` (checkout Codex/Kimi). Sono due
  checkout dello stesso repo, per progetto — verificare sempre `git log` su
  entrambi.
- Motore identita'/merge: `docs/unified-identity-ownership-engine.md`.
- Regola: i Deal si creano sempre a mano, mai automaticamente.
- Verificare le modifiche su https://experviser-crm.onrender.com/, non in
  locale.
