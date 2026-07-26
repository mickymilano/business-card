# HANDOFF — Business Card Reader

Ultimo aggiornamento: 27 luglio 2026
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

## Rischio aperto e urgente: i biglietti gia' scansionati

Non esiste **nessuna copia sul server**. Tutti i contatti gia' scansionati
vivono in **IndexedDB dentro il browser** che Michele ha usato (database
`BizScanPro`), legati all'indirizzo web da cui apriva l'app.

Se si puliscono i dati di navigazione, spariscono.

**Prima cosa da fare, prima di qualunque sviluppo**: aprire l'app dallo stesso
browser/dispositivo, pagina **Backup**, esportare il JSON completo (progetti,
contatti, aziende, impostazioni). L'export CSV della pagina Export perde le
relazioni ed e' un ripiego.

Domanda ancora senza risposta: **da quale dispositivo/browser ha scansionato,
e l'app e' ancora raggiungibile da qualche parte?**

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

## Prossimo passo concreto

Lato CRM, in quest'ordine:

1. tabelle progetti scansione + schede;
2. endpoint di ricezione push con chiave di idempotenza e archiviazione
   immagine (riusare `CrmFileService`);
3. estrazione server-side (riusare il prompt e lo schema gia' scritti in
   `backend/server.py`, che sono buoni);
4. UI sezione Scansioni con revisione e conversione via motore di identita';
5. riduzione dello scanner a client di cattura.

Poi, separatamente: recupero dei biglietti gia' scansionati dal backup JSON.

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
