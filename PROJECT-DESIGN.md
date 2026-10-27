# FlintBench v2

## Obiettivo

Un'applicazione funzionante derivata da FlintBench, in una cartella indipendente. Cambiare l'esperienza frontend mantenendo servizi locali, API, terminali, profili e funzionalità esistenti.

## Analisi del frontend originale

- JavaScript ES modules e DOM nativo, nessun framework. La shell monta le viste in base al router; lo store riceve lo stato iniziale via HTTP e gli aggiornamenti via WebSocket.
- La home precedente usa saluto, progetti live, memoria recente, contatori e una tabella. Su schermi piccoli gli stili originali nascondono alcune colonne e le etichette della navigazione.
- `home.js` esporta comandi usati anche nello spazio progetto: avvio, arresto, ripresa e segnali degli agenti. Questi contratti devono restare compatibili.
- La UI comunica con veri servizi locali: Git, filesystem, Docker, PTY, editor e CLI degli agenti. Una riproduzione statica della home perderebbe queste funzioni.

## Lettura del riferimento

Il riferimento fornito è una griglia di contenitori scuri, morbidi e opachi: quattro colonne desktop, nomi evidenti, indicatore di stato, badge della tecnologia, descrizione breve, interruttore e azione primaria. Una riga divisa da un bordo raccoglie i metadati secondari. Ricerca e filtro stanno sopra la griglia.

Non vengono riprodotti lo sfondo fotografico, il blur atmosferico, il titolo Hub, i nomi o i dati dell'immagine. I contenitori contengono informazioni e comandi di FlintBench.

## Direzione implementata

- Canvas grafite uniforme, superfici antracite, testo Geist locale; chiaro e sistema restano supportati. I preset partono da uno sfondo uniforme; Custom conserva la scelta dei pattern.
- Intestazione FlintBench, percorso delle cartelle e conteggio reale dei progetti in esecuzione.
- Navigazione orizzontale. Fino a 960 px la barra va su due righe (marchio, orologio e blocco sopra; sezioni scorrevoli sotto, con dissolvenza sul bordo). Il comando globale, le scorciatoie e il blocco restano disponibili.
- Griglia 4 / 3 / 2 / 1 colonne secondo lo spazio. Card da circa 280 px di altezza, raggi 25 px e spaziatura 20 px: valori derivati dai contenitori del riferimento.
- Verde riservato allo stato running, ambra alle modifiche Git; gli accenti dei profili restano personalizzabili.
- L'interruttore invoca i comandi originali. Open apre lo spazio di lavoro interno; Resume ripristina servizi, terminali e conversazione tramite il flusso originale. Menu esplicito e clic destro espongono gli strumenti aggiuntivi.
- Le descrizioni vengono lette da package.json; in assenza di una descrizione si mostra lo stack, senza inventare testo sui progetti.
- Attività live e ripresa sono integrate nelle card principali. Il bordo prende una tinta discreta dello strumento; lo stato ha uno shimmer e il simbolo animato di Claude, Codex, Antigravity/Gemini o un cursore per i file modificati. Un editor aperto senza salvataggi recenti e un agente in attesa rimangono fermi. Gli stessi segnali sono leggibili senza movimento con reduced motion. La fase delle animazioni viene conservata durante gli aggiornamenti WebSocket. Il flag di profilo Home / Live project activity controlla gli effetti live.
- L'ultima conversazione disponibile compare nella card insieme al comando Resume. Solo i nuovi progetti rilevati restano in una sezione espandibile sotto la griglia. Gli avvisi urgenti restano in alto.
- Focus visibile, menu da tastiera, stato dello switch accessibile, link per saltare alla zona di lavoro e rispetto di reduced motion.

## Revisione: orologio sempre visibile

Richiesta: orologio sempre visibile e in un'altra posizione. Prima era un pannello nascosto dietro un pulsante, sopra l'intestazione della home, e dentro i progetti c'era solo il testo nella status bar.

- Posizione: barra superiore, accanto a ricerca e blocco. È l'unico punto presente in tutte le viste, progetti inclusi, e non copre contenuti.
- Forma: le cifre a sette segmenti della v1 restano (sono il carattere dell'orologio), ridotte a 21 px, nel colore accento invece del blu fisso, così seguono il profilo. Accanto giorno e data in maiuscoletto; sotto 1100 px restano solo le cifre, sotto 400 px sparisce anche il paio dei secondi.
- L'intero display è il pulsante: apre un pannello a discesa con data completa, la settimana con oggi evidenziato (la colonna dei giorni della v1) e il timer. Durante il conto alla rovescia il tempo restante sostituisce la data; quando suona il bordo lampeggia e un clic ferma l'allarme. Il comando "Set a timer" è anche nella palette (Ctrl+K).
- Rimossi i doppioni: orologio e timer nella status bar dei progetti.
- Riduzioni: niente bagliore dei segmenti nel tema chiaro (sul fondo chiaro sporcava le cifre); su telefono il pannello diventa largo quanto lo schermo e il campo personalizzato va a capo.

Altre correzioni emerse dalla revisione:

- La barra superiore traboccava fra 680 e 960 px (il blocco usciva dallo schermo): ora passa a due righe a 960 px e nasconde il nome del marchio fra 961 e 1100 px.
- Vista progetto su telefono: le azioni della testata allargavano la griglia e il contenuto usciva a destra. Ora la griglia è vincolata e le azioni diventano solo icone (con il titolo accessibile).
- Home: tolto il testo di riempimento "Everything in one place"; la nota mostra solo dati reali (agenti, editor, avvisi). Filtri su telefono in una riga scorrevole; pulsante "…" delle card portato a 32 px; ricerca elastica fra 680 e 960 px.
- Rimossi gli spazi riservati al vecchio orologio in basso a destra (150 px in fondo alle viste, notifiche alzate).

## Revisione: temi colore, sfondo e trasparenza

Richiesta: sfondo personalizzato, temi a colori, livello di trasparenza; per ora una blue hour animata (riferimento: lago con chiesa sull'isola e castello sulla rupe), con opzioni di sfocatura e animazione.

- Le scelte sono personali come tema e scala, non del profilo: `settings.appearance` (`palette`, `scene`, `sceneMotion`, `sceneBlur`, `transparency`), validate dal server con le costanti di `app/web/js/lib/appearance.js`.
- Temi colore: token `--*-solid` per tela, superfici, testo secondario e linee, in scuro e chiaro. L'accento resta del profilo.
- Trasparenza: `--glass` (0–0.5) deriva `--bg`, `--surface`, `--raised` dai valori solidi con `color-mix`; menu e dialoghi perdono al massimo il 16% di opacità, le barre sticky restano solide, la pagina tiene la tela solida sotto tutto.
- Sfondo: `app/web/js/lib/scene.js` disegna la scena su canvas, senza immagini scaricate né la foto di riferimento. Rumore a valori per nuvole affiancabili, creste con rumore proporzionale all'altezza, alberi sulle colline, neve sulla vetta, rupe illuminata con castello, isola con chiesa e campanile, luci a riva. L'acqua specchia la parte sopra l'orizzonte riga per riga con due increspature lente; le luci più forti hanno scie lunghe e tremolanti.
- Costo: risoluzione interna 66% (50% o 35% se sfocato), 24 fps, cielo ridisegnato a frame alterni, pausa a pagina nascosta. Animazione spenta o reduced motion: un fotogramma fermo. Misurato su RTX 2070: 60 fps nella pagina e nessun long task durante l'animazione.
- Leggibilità: una velatura col colore della tela sopra la scena (più forte nel tema chiaro), ombra leggera sul testo appoggiato direttamente sulla scena.
- Correzione: il badge numerico nella barra (Home, GitHub) era diventato inline con line-height 15 px in una casella da 17 px. Ora è un flex 18×18, con il numero centrato sull'altezza delle maiuscole.

## Revisione: profili, valori numerici, terminale, dimensione del testo

Richieste: valori numerici scrivibili o trascinabili; profili non più distinti dai colori, con icone; accento del profilo modificabile in Appearance; ogni modifica estetica o di funzione rende il profilo Custom; terminale che non copre la sidebar del progetto, anche massimizzato, con animazioni; testo predefinito più grande, con l'interfaccia che lo segue; componenti della barra allineati.

- Valori numerici: `rangeField` in `settings.js` unisce un cursore e un campo numerico con l'unità. Il trascinamento si vede subito e viene registrato al rilascio; il numero scritto viene registrato mentre lo si digita e confermato con Invio o uscendo dal campo; Esc ripristina il valore. Intervalli scelti: scansione 1–8 livelli, testo 75–150%, sfocatura 0–40 px (oltre resta solo colore), trasparenza 0–60% (oltre il testo perde appoggio), voce 0–100%, blocco 0–480 min (0 = mai). Il server valida gli stessi intervalli (`appearance.js`: `inRange`, `isUiScale`).
- Profili: icone (foglia, chiave inglese, livelli, scintilla, provetta, cursori) al posto dei campioni di colore. Il profilo porta ancora accento, motivo e densità, ma si modificano in Appearance. `customise()` crea un Custom a partire da tutto ciò che il profilo in uso conteneva. Se una modifica annulla l'ultima differenza, torna il profilo originale. La scheda Profile mostra sempre le funzioni del profilo in uso.
- Terminale: in `.project` il menu occupa la colonna sinistra su due righe, contenuto e terminale la destra. Massimizzato, il terminale esce dalle aree della griglia e si posiziona sotto la testata e accanto al menu. Le animazioni (`dock.js`) muovono solo il bordo superiore: apertura e chiusura animano l'altezza, massimizzazione e ripristino fanno scorrere il pannello a piena altezza ritagliato al piede. Il terminale viene adattato una volta sola, a fine movimento. Con reduced motion non c'è animazione.
- Testo: `--ui-base: 1.1` in v2 (il 100% della v1 era 1.15, la v2 era rimasta a 1). La colonna delle pagine mantiene la larghezza della barra in alto a ogni scala, così le due restano allineate. Dentro un progetto la barra usa tutta la larghezza: il marchio si allinea al titolo del progetto, il lucchetto alle azioni.

## Revisione: sfondo video, Agents, Projects, titoli

Richieste: niente 3D o WebGL per lo sfondo, ma video veri in alta risoluzione (per ora uno, blue hour); nessuna ombra sul terminale a schermo intero; pulsanti della testata del progetto centrati; dimensione del testo con tasti invece della barra; titoli delle sezioni più evidenti, senza descrizioni; sezione Agents da sistemare; Docker Up/Down visibile nella barra in basso; in Projects i non aggiunti sotto gli attivi, richiudibili.

- Sfondo: `lib/scene.js` ora mette un `<video>` muto in loop dietro la console, WebM VP9 come formato principale e H.264 come riserva. Si ferma sul fotogramma corrente con animazione spenta, con reduced motion e a pagina nascosta. L'anteprima nel selettore è un'immagine. Il video originale Mixkit 4K (licenza gratuita, senza obbligo di attribuzione) è stato ridotto a 10 s, con gli ultimi 2 s in dissolvenza sui primi per un loop senza stacchi: 6,3 MB WebM, 21 MB MP4. Il server serve `.webm` e `.mp4` a intervalli di byte (206). La scena procedurale descritta sopra non c'è più.
- Terminale: tolta l'ombra del pannello massimizzato. Testata del progetto: le azioni sono centrate sull'altezza della testata, non sull'area sotto il suo margine superiore.
- Text size: tasti − e + che salgono o scendono al multiplo di 5 successivo; il numero si può anche scrivere, e ← / → nel campo fanno un passo.
- Titoli: `.page-head h1` usa il carattere del titolo della Home (32–46 px); tolte le descrizioni sotto i titoli in Projects, Agents, Activity e Settings (GitHub tiene solo lo stato dell'accesso). I gruppi di Settings hanno titoli da 15 px nel colore del testo, non più etichette da 10 px.
- Agents: problemi trovati: tutta la pagina veniva ridisegnata a ogni aggiornamento live, chiudendo il filtro aperto; nessun modo di avviare un agente; Stop senza conferma; durate ferme; conteggi a zero ovunque; etichette "outside"/"FlintBench" poco chiare; su telefono file e commit sparivano. Ora ogni parte si ridisegna solo con i propri dati, ogni strumento ha "Start in…" (menu dei progetti, i più recenti per primi), Stop chiede conferma, le durate avanzano ogni 30 s, compaiono solo i conteggi diversi da zero, le etichette sono "Started here"/"External", c'è il filtro per agente e "Show older sessions". La nota sul conteggio è un'icona informativa accanto a Journal.
- Docker nella barra in basso: Up o Down sempre visibile con l'integrazione attiva; Off solo con i dettagli tecnici.
- Projects: i progetti trovati e non aggiunti stanno dopo la tabella, in un cassetto che si può chiudere (`projects.candidates.open`), con "Add all" in fondo.

## Revisione: video blue hour reale, cursori fluidi

- Il primo video (time-lapse Mixkit) era troppo veloce e non era blue hour. Sostituito con "Blue hour cityscape over tranquil river" (Pexels, ripreso in tempo reale, luce blu costante per tutto il minuto, inquadratura fissa): loop di 30 s con 3 s di dissolvenza, 2560×1440, 6,3 MB WebM e 14,6 MB MP4. È stato scartato "Evening in harbor", che diventa notte durante la ripresa e non si può mettere in loop.
- Cursore della trasparenza: la parola "Solid" compariva solo a 0 e restringeva il cursore sotto il puntatore, che così cambiava valore da solo (flicker vicino a 0). Ora la parola ha uno spazio fisso. L'anteprima viene applicata una volta per fotogramma durante il trascinamento, e il tema non riscrive più attributi, variabili e localStorage rimasti uguali, che a ogni movimento facevano ricalcolare gli stili di tutta la pagina.

## Revisione: feedback delle icone

Richiesta: rendere vive le icone dove ha senso, al passaggio sul controllo o direttamente sul simbolo, usando `velora-design`. Ambito: navigazione globale e di progetto, ricerca globale, Scan, Add project, Open, Resume e azioni principali della testata. I segnali di attività mantengono il loro significato reale.

- Baseline prima delle alternative: conservare il canvas grafite `#101318`, Geist, card arrotondate, struttura, titoli e azioni esistenti; accompagnare i controlli con un piccolo sollevamento uniforme. È un intervento sulle icone, non un nuovo layout.
- Alternative: sollevamento uniforme; disegno progressivo delle linee; movimento per funzione, con porzioni fisse e mobili dello stesso simbolo. Scelta la terza: la freccia Open esce verso destra e in alto, Resume segue il proprio arco, i cursori Settings si muovono in opposizione, il centro Agents rimane fermo mentre i raggi ruotano. Le alternative visive del sito completo sono escluse dal perimetro esplicito della richiesta.
- Estremo esplorato: rotazioni complete e ripetizione durante hover. Riduzione: una sola transizione verso una posa contenuta, reversibile, perché cicli continui competerebbero con i veri agenti al lavoro. GitHub, marchio, lucchetto, segnali di stato e azioni distruttive restano statici. I metadati delle card non reagiscono al loro contenitore.
- Valori locali: spostamenti pari al 7–13% del tratto, fino al 15% di espansione del segnale Activity; rotazioni di 4° sulla cartella, 18° sui raggi Agents, 24° sulle frecce circolari. Sono derivati dalle icone da 13–16 px per restare circa entro un tratto e il loro viewport. I 180 ms seguono il feedback di colore da 150 ms già presente, lasciando leggibile il movimento interno. Non sono preset per altri progetti.
- Implementazione: CSS sui tratti SVG, senza listener o cicli JavaScript, senza spostare controllo, label o focus ring. Hover limitato a puntatore fine; focus da tastiera indipendente; pressione anche su touch; nessuna risposta per controlli disabilitati, occupati o distruttivi. Con reduced motion i tratti restano completamente fermi e rimangono i normali segnali di focus e selezione.
- Verifica: `qa/icon-motion.mjs`, eseguito da `qa/verify.mjs`, controlla il trigger sul testo e sul simbolo, le parti fisse, la stabilità dell'area cliccabile dopo l'assestamento della home, focus e attivazione da tastiera, pressione, ingressi rapidi, condizioni disabled/busy simulate, movimento ridotto e navigazione con touch emulato. Il polling dell'host può cancellare l'editor simulato: il test live ripubblica il fixture subito prima di verificarlo, mantenendo l'asserzione originale sul testo VS Code. La suite completa copre 31 controlli; immagini `docs/v2/icon-motion-desktop.png` e `icon-motion-mobile.png`. Safari, Firefox, dispositivi fisici e screen reader non verificati.

## Revisione: icone ridisegnate e animate ovunque

Richiesta: icone di qualità più alta, animate dai pulsanti alle sezioni (`velora-design`, riferimento icon-motion); niente "v2" nel marchio; sfondo personalizzato anche nel login.

- Disegno: set ridisegnato su griglia 24 con raggi di 2 unità, cerchi e riquadri veri (non più tratti da .01), giunzioni tonde. Lo spessore dipende dalla dimensione (`36 / size`, fra 1,75 e 2,6 unità): circa 1,5 px a schermo da 11 a 22 px, invece di 0,9 px a 14 px. I tre punti sono pieni. GitHub resta il segno Lucide.
- Ambito: qualunque link, pulsante, tab o voce di menu che contiene un'icona come figlio diretto. Card, metadati, segnali live e marchio restano fermi perché non sono controlli. Ora si animano anche le azioni distruttive: il coperchio del cestino si alza, ma non simula l'esito.
- Movimento per parte: porta di Home che si apre, aletta della cartella, raggi Agents a 45° con il nucleo che cresce, cursori Settings in opposizione, freccia Open, lancetta di Resume e Timer, riquadri Overview che si separano, parentesi dell'editor che si aprono, angoli di maximize/minimize, Refresh a 180°, Restart a 360°, Plus e X a 90°. Gesti una tantum dove una posa non basta: Activity e Check si disegnano, l'occhio sbatte la palpebra, la campana suona, il lucchetto scatta, il cursore del terminale lampeggia. Le animazioni finiscono a riposo e non lasciano code.
- Ingressi invariati: hover solo con puntatore fine, focus da tastiera, pressione a metà corsa, niente per disabled/busy, tutto fermo con reduced motion.
- Login: `/api/auth/state` include `look` (palette, scena, sfocatura, trasparenza) e lo sfondo video compare anche in un browser che non ha mai aperto la console. Verificato in `qa/verify.mjs`.

## Confini della copia

L'originale non viene modificato. La v2 conserva una copia della lista dei progetti, delle impostazioni e dei metadati dei progetti. Gli stessi percorsi continuano a indicare le vere cartelle sul computer: comandi, modifiche Git e azioni sui file agiscono su quei progetti.

Password, sessioni e stato GitHub non vengono copiati. La v2 richiede la creazione del proprio account locale; le integrazioni continuano a usare i login dei loro CLI. Porta predefinita 4478, dati in `data/` indipendenti dalla v1.

## Verifica

Script ripetibile: `qa/verify.mjs`. Usa Chromium/Playwright e dati, repository Git e servizi reali isolati in `qa/.runs/`. Nessun account di prova o progetto fittizio viene aggiunto a `data/`.

Risultati: `docs/v2/verification.json`. Immagini: `home-desktop.png`, `home-mobile.png`, `home-light.png` in `docs/v2/`. Le immagini mostrano esclusivamente i progetti di QA.

Controlli browser: account, bootstrap, ricerca, filtri, ordinamento, menu, scorciatoie, start/stop di un server HTTP tramite PTY, WebSocket, ripresa del terminale, viste e lettura file, temi, profili, lock/unlock e assenza di overflow della home a otto larghezze fra 320 e 1920 px. La regressione di attività usa stati simulati degli agenti/editor inviati dal backend sul vero WebSocket e un salvataggio reale nel filesystem: verifica stati working/idle, tutti i simboli, continuità della fase e reduced motion. Le immagini dedicate sono `activity-desktop.png` e `activity-mobile.png`.

GitHub con operazioni remote, Docker, avvio degli editor e conversazioni reali degli agenti conservano le implementazioni originali e richiedono i relativi strumenti/account. Non sono verificati end-to-end con questi servizi esterni. Non sono stati eseguiti test su dispositivo fisico, screen reader, Firefox o Safari.
