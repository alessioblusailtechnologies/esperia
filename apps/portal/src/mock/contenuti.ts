/**
 * Contenuti dimostrativi del portale.
 *
 * Sono i dati che alimentano la modalita' mock (MOCK=1): una redazione finta,
 * completa ma innocua, che permette di far vedere il portale al Committente
 * senza CMS, senza database e senza contenuti reali.
 *
 * REGOLE DI SCRITTURA, da rispettare aggiungendo articoli.
 *
 *  1. Nessuna persona reale identificabile. Le fonti si citano per ruolo
 *     ("il viceministro all'Economia", "l'inviato ONU"), mai per nome: un
 *     articolo inventato attribuito a una persona vera e' una notizia falsa,
 *     e questo sito e' pubblicamente raggiungibile.
 *  2. Nessuna dichiarazione virgolettata attribuita a un individuo reale.
 *  3. Le immagini sono composizioni astratte generate (public/mock/media), non
 *     fotografie: una foto vera accanto a una notizia inventata la fa sembrare
 *     autentica. Vedi src/mock/README.md.
 *
 * Il resto — istituzioni, enti, imprese citate come soggetti economici — segue
 * il registro gia' usato da apps/cms/src/lib/seed-demo.ts, da cui i primi
 * undici articoli sono ripresi tali e quali.
 */

export interface AutoreMock {
  id: string
  nome: string
  bio: string
}

export interface ArticoloMock {
  titolo: string
  occhiello?: string
  sottotitolo?: string
  sommario: string
  categoria: string
  tag: string[]
  paragrafi: string[]
  inEvidenza?: boolean
  /** Ore trascorse dalla pubblicazione: le date restano fresche a ogni build. */
  oreFa: number
  /** Slug della copertina in public/mock/media, oppure niente. */
  copertina?: string
  /** Indice in AUTORI. */
  firma: number
}

export const CATEGORIE = [
  {
    name: 'Cronaca',
    slug: 'cronaca',
    order: 10,
    color: '#b3261e',
    description: 'Fatti, territori, cronaca giudiziaria.',
  },
  {
    name: 'Mondo',
    slug: 'mondo',
    order: 15,
    color: '#0f6b6b',
    description: 'Esteri, diplomazia, conflitti.',
  },
  {
    name: 'Politica',
    slug: 'politica',
    order: 20,
    color: '#1b4d8f',
    description: 'Governo, Parlamento, territori.',
  },
  {
    name: 'Economia',
    slug: 'economia',
    order: 30,
    color: '#1b5e20',
    description: 'Lavoro, imprese, conti pubblici.',
  },
  {
    name: 'Cultura',
    slug: 'cultura',
    order: 40,
    color: '#6a1b9a',
    description: 'Libri, spettacoli, patrimonio.',
  },
  {
    name: 'Sport',
    slug: 'sport',
    order: 50,
    color: '#e65100',
    description: 'Campionati, atleti, discipline.',
  },
]

export const AUTORI: AutoreMock[] = [
  { id: 'a1', nome: 'Emanuele Ragusa', bio: 'Segue la politica economica e il Parlamento.' },
  { id: 'a2', nome: 'Elena Costa', bio: 'Si occupa di economia, lavoro e infrastrutture.' },
  { id: 'a3', nome: 'Luca Ferraro', bio: 'Cronaca e territori.' },
  { id: 'a4', nome: 'Marta Bellini', bio: 'Cultura, spettacoli e patrimonio.' },
]

export const ARTICOLI: ArticoloMock[] = [
  {
    titolo: 'Manovra, il governo trova l’intesa sul taglio dell’Irpef per il ceto medio',
    occhiello: 'Manovra 2027',
    sottotitolo:
      'Seconda aliquota al 33% fino a 60 mila euro, coperture da banche e assicurazioni. Le opposizioni annunciano battaglia in commissione Bilancio.',
    sommario:
      'Accordo raggiunto nella notte a Palazzo Chigi: seconda aliquota al 33% fino a 60 mila euro, coperture dalle banche e dalla revisione delle detrazioni.',
    categoria: 'politica',
    tag: ['Manovra 2027', 'Fisco', 'Palazzo Chigi'],
    inEvidenza: true,
    oreFa: 3,
    copertina: 'cop-01',
    firma: 0,
    paragrafi: [
      'L’intesa è arrivata poco dopo le due di notte, dopo sei ore di riunione a Palazzo Chigi. Il taglio della seconda aliquota Irpef dal 35 al 33 per cento salirà fino a 60 mila euro di reddito, un perimetro più ampio di quello discusso nella bozza tecnica di lunedì.',
      'Il costo dell’intervento è stimato in 4,2 miliardi per il primo anno. Le coperture, secondo la nota diffusa dal Mef, arriveranno per metà dal contributo di banche e assicurazioni e per il resto dalla revisione delle detrazioni sopra i 120 mila euro.',
      'Il contributo del settore creditizio resta la parte più fragile del quadro. L’Abi ha chiesto garanzie sulla natura temporanea del prelievo, mentre il viceministro all’Economia parla di un accordo già scritto nei numeri.',
      'Nel testo entrano anche due misure attese dagli enti locali: la proroga del fondo per le aree interne e il rifinanziamento del trasporto pubblico regionale, quest’ultimo con una dotazione ridotta rispetto al 2026.',
      'L’esame parlamentare partirà martedì. Le opposizioni hanno già annunciato oltre milleduecento emendamenti, concentrati su sanità e contratti pubblici; la maggioranza punta all’approvazione entro il 20 dicembre.',
      'Resta aperta la partita sulle pensioni, rinviata a un tavolo tecnico che si riunirà la prossima settimana.',
    ],
  },
  {
    titolo: 'Vertice UE sui dazi: Roma chiede una clausola di salvaguardia per l’agroalimentare',
    sommario:
      'Il tavolo di Bruxelles slitta a settembre. Confagricoltura stima 400 milioni di export a rischio.',
    categoria: 'mondo',
    tag: ['Unione Europea', 'Dazi'],
    inEvidenza: true,
    oreFa: 5,
    copertina: 'cop-02',
    firma: 1,
    paragrafi: [
      'Il tavolo tecnico convocato a Bruxelles si è chiuso senza un mandato negoziale. La delegazione italiana ha chiesto una clausola di salvaguardia per i prodotti a denominazione protetta, sostenuta da Spagna e Grecia.',
      'Secondo le stime di Confagricoltura l’esposizione del comparto vale circa 400 milioni di euro di export annuo, concentrati su formaggi stagionati, vino e conserve.',
      'La Commissione ha rinviato ogni decisione alla riunione di settembre, quando sarà disponibile la valutazione d’impatto commissionata a maggio.',
    ],
  },
  {
    titolo: 'Alta velocità Salerno-Reggio, il cronoprogramma slitta di due anni',
    sommario:
      'La relazione della Corte dei conti sui lotti calabresi: appalti fermi e costi rivisti del 12%.',
    categoria: 'economia',
    tag: ['Infrastrutture', 'Mezzogiorno'],
    inEvidenza: true,
    oreFa: 7,
    copertina: 'cop-03',
    firma: 1,
    paragrafi: [
      'La relazione depositata dalla Corte dei conti fotografa uno scostamento di ventiquattro mesi sul cronoprogramma dei lotti calabresi, con una revisione dei costi del 12 per cento rispetto al quadro economico del 2024.',
      'Due appalti risultano sospesi in attesa della verifica antimafia sulle imprese subappaltatrici; un terzo è stato riaggiudicato a marzo dopo il ricorso della seconda classificata.',
      'Il commissario di governo ha annunciato una revisione del piano entro ottobre, con l’obiettivo di recuperare almeno dodici mesi sui lotti già cantierati.',
    ],
  },
  {
    titolo: 'Musei statali, ingressi in crescita del 9%: il sorpasso di Pompei su Firenze',
    sommario:
      'I dati del ministero sul primo semestre. Cresce il pubblico under 25, calano le scolastiche.',
    categoria: 'cultura',
    tag: ['Musei', 'Turismo'],
    oreFa: 20,
    copertina: 'cop-04',
    firma: 3,
    paragrafi: [
      'Il primo semestre chiude con 32 milioni di ingressi nei musei e nei parchi archeologici statali, in crescita del 9 per cento rispetto allo stesso periodo del 2025.',
      'Il parco archeologico di Pompei supera per la prima volta il polo museale fiorentino, trainato dall’apertura serale estiva e dal nuovo percorso sulla Villa dei Misteri.',
      'Cresce di quattro punti la quota di visitatori sotto i venticinque anni, mentre calano le visite scolastiche: il ministero attribuisce il dato al taglio dei fondi per i trasporti delle scuole.',
    ],
  },
  {
    titolo: 'Consiglio dei ministri convocato per giovedì: sul tavolo il decreto Aree interne',
    sommario: 'Il provvedimento contiene la proroga del fondo e il rifinanziamento dei servizi.',
    categoria: 'politica',
    tag: ['Aree interne', 'Governo'],
    oreFa: 9,
    copertina: 'cop-05',
    firma: 0,
    paragrafi: [
      'Il Consiglio dei ministri è stato convocato per giovedì mattina. All’ordine del giorno il decreto sulle aree interne, atteso dai sindaci dei piccoli comuni da oltre un anno.',
      'Il testo proroga di dodici mesi il fondo di coesione territoriale e introduce un meccanismo di premialità per i comuni che associano i servizi.',
    ],
  },
  {
    titolo: 'Istat: inflazione ferma all’1,8% ad agosto, rallenta il carrello della spesa',
    sommario: 'Il dato provvisorio conferma le attese. Frena il comparto alimentare.',
    categoria: 'economia',
    tag: ['Inflazione', 'Istat'],
    oreFa: 10,
    firma: 1,
    paragrafi: [
      'L’indice nazionale dei prezzi al consumo si è attestato all’1,8 per cento su base annua, in linea con il mese precedente e con le attese degli analisti.',
      'Il cosiddetto carrello della spesa rallenta all’1,2 per cento, il valore più basso da diciotto mesi. Restano in tensione i servizi ricettivi, che risentono della stagione turistica.',
    ],
  },
  {
    titolo: 'Maltempo in Liguria, allerta arancione sul levante: scuole chiuse a Chiavari',
    sommario: 'La protezione civile ha esteso l’allerta fino alla mezzanotte di domani.',
    categoria: 'cronaca',
    tag: ['Maltempo', 'Liguria'],
    oreFa: 11,
    copertina: 'cop-06',
    firma: 2,
    paragrafi: [
      'L’allerta arancione riguarda il levante ligure e i bacini padani di ponente. La protezione civile regionale ha esteso l’avviso fino alla mezzanotte di domani.',
      'I comuni di Chiavari, Lavagna e Sestri Levante hanno disposto la chiusura delle scuole di ogni ordine e grado.',
    ],
  },
  {
    titolo: 'Tregua in Sudan, l’inviato ONU: «Corridoi umanitari aperti entro settantadue ore»',
    sommario: 'L’intesa riguarda il Darfur settentrionale. Restano esclusi i valichi orientali.',
    categoria: 'mondo',
    tag: ['Sudan', 'ONU'],
    oreFa: 12,
    copertina: 'cop-07',
    firma: 0,
    paragrafi: [
      'L’intesa raggiunta a Gedda prevede l’apertura di tre corridoi umanitari nel Darfur settentrionale entro settantadue ore.',
      'Restano esclusi dall’accordo i valichi orientali, dove i combattimenti sono proseguiti anche nelle ultime quarantotto ore.',
    ],
  },
  {
    titolo: 'Regionali, il campo largo tratta in Veneto: vertice a Roma tra i segretari',
    sommario: 'Sul tavolo il nome del candidato e il perimetro della coalizione.',
    categoria: 'politica',
    tag: ['Regionali', 'Veneto'],
    oreFa: 13,
    firma: 0,
    paragrafi: [
      'Il vertice romano tra i segretari si è chiuso senza un nome, ma con l’impegno a chiudere la partita entro la fine del mese.',
      'Il nodo resta il perimetro della coalizione: due delle liste minori chiedono garanzie sul programma sanitario prima di aderire.',
    ],
  },
  {
    titolo: 'Stellantis rinvia il piano Mirafiori: incontro al Mimit con i sindacati',
    sommario: 'La produzione del nuovo modello slitta al secondo trimestre.',
    categoria: 'economia',
    tag: ['Stellantis', 'Lavoro'],
    oreFa: 14,
    copertina: 'cop-08',
    firma: 1,
    paragrafi: [
      'Il gruppo ha comunicato ai sindacati lo slittamento al secondo trimestre dell’avvio produttivo del nuovo modello previsto a Mirafiori.',
      'L’incontro al ministero delle Imprese è convocato per la prossima settimana; le organizzazioni sindacali chiedono garanzie sugli ammortizzatori.',
    ],
  },
  {
    titolo: 'Venezia 83, standing ovation per il film sul processo di Palermo',
    sommario: 'Otto minuti di applausi in sala grande. Il regista: «Non è un film di parte».',
    categoria: 'cultura',
    tag: ['Cinema', 'Venezia'],
    oreFa: 16,
    firma: 3,
    paragrafi: [
      'Otto minuti di applausi hanno accolto la proiezione in sala grande. Il film ricostruisce le tre fasi del processo attraverso gli atti e le testimonianze dirette.',
      'Il regista ha respinto le critiche arrivate nei giorni scorsi: «Non è un film di parte, è un film di documenti».',
    ],
  },
  {
    titolo: 'Incendio in un capannone nel Modenese: nessun ferito, disposte verifiche sull’aria',
    sommario: 'Il rogo è divampato all’alba in un deposito di materiali plastici. Arpae al lavoro.',
    categoria: 'cronaca',
    tag: ['Incendio', 'Emilia-Romagna'],
    oreFa: 15,
    copertina: 'cop-09',
    firma: 2,
    paragrafi: [
      'Le fiamme sono divampate poco dopo le cinque in un deposito di materiali plastici alla periferia del comune. Le squadre dei vigili del fuoco hanno lavorato per sei ore prima di dichiarare il rogo sotto controllo.',
      'Non risultano feriti: il capannone era vuoto al momento dell’innesco. Il sindaco ha firmato un’ordinanza che invita a tenere chiuse le finestre nel raggio di due chilometri fino a nuova comunicazione.',
      'L’agenzia regionale per l’ambiente ha installato tre centraline mobili per il monitoraggio della qualità dell’aria. I primi esiti sono attesi entro quarantotto ore.',
    ],
  },
  {
    titolo: 'Roma, chiude per due settimane un tratto della metro B: bus sostitutivi dalle 5.30',
    sommario: 'Lavori di sostituzione dei binari fra due stazioni. Previste corse ogni sei minuti.',
    categoria: 'cronaca',
    tag: ['Trasporti', 'Roma'],
    oreFa: 26,
    firma: 2,
    paragrafi: [
      'Il tratto resterà chiuso per quattordici giorni a partire da lunedì, per consentire la sostituzione di un chilometro e mezzo di binari e il rifacimento di due scambi.',
      'Il servizio sostitutivo su gomma partirà alle 5.30 con una frequenza prevista di sei minuti nelle ore di punta. L’azienda dei trasporti stima un allungamento medio del percorso di undici minuti.',
      'È il secondo intervento programmato sulla linea nell’arco dell’anno: il precedente, a marzo, si era chiuso con tre giorni di anticipo.',
    ],
  },
  {
    titolo: 'Truffe agli anziani, operazione dei carabinieri in quattro province',
    sommario: 'Diciassette misure cautelari. Il metodo: falsi incidenti e finti incaricati.',
    categoria: 'cronaca',
    tag: ['Truffe', 'Sicurezza'],
    oreFa: 34,
    firma: 2,
    paragrafi: [
      'L’operazione, coordinata dalla procura del capoluogo, ha portato all’esecuzione di diciassette misure cautelari fra Lazio, Campania, Puglia e Abruzzo.',
      'Il metodo ricostruito dagli inquirenti è quello del falso incidente: una telefonata annunciava un familiare in ospedale e la necessità immediata di denaro o gioielli, poi ritirati a domicilio da un finto incaricato.',
      'Gli episodi contestati sono oltre novanta, per un danno stimato in un milione e duecentomila euro. È stato rinnovato l’invito a chiudere la porta e a chiamare il 112 in caso di richieste analoghe.',
    ],
  },
  {
    titolo: 'Bonus edilizi, l’Agenzia delle entrate pubblica la nuova circolare sulle detrazioni',
    sommario: 'Chiarimenti su cessione del credito e cantieri aperti prima della scadenza.',
    categoria: 'economia',
    tag: ['Fisco', 'Edilizia'],
    oreFa: 19,
    firma: 1,
    paragrafi: [
      'La circolare chiarisce il trattamento dei cantieri avviati prima della scadenza del regime precedente e le condizioni di ammissibilità della cessione del credito residuo.',
      'Restano fuori dal perimetro le spese sostenute per unità immobiliari non ancora accatastate al momento della comunicazione di inizio lavori.',
      'Le associazioni delle imprese edili chiedono una proroga tecnica di sessanta giorni per allineare le pratiche già depositate.',
    ],
  },
  {
    titolo: 'Il festival della filosofia raddoppia le sedi: attese sessantamila presenze',
    sommario: 'Tre giorni, quattro città, ottanta incontri gratuiti. Il tema di quest’anno è la misura.',
    categoria: 'cultura',
    tag: ['Festival', 'Filosofia'],
    oreFa: 28,
    copertina: 'cop-10',
    firma: 3,
    paragrafi: [
      'L’edizione di quest’anno si allarga a una quarta città e porta il numero degli incontri a ottanta, tutti a ingresso libero e distribuiti su tre giorni.',
      'Il tema scelto dal comitato scientifico è la misura, declinata fra etica, statistica e architettura. Sono previste dodici lezioni magistrali e una sezione dedicata alle scuole superiori.',
      'Gli organizzatori stimano sessantamila presenze complessive, in crescita rispetto alle cinquantaduemila registrate lo scorso anno.',
    ],
  },
  {
    titolo: 'Elezioni in Portogallo, affluenza in calo di sei punti: nessuna maggioranza in vista',
    sommario: 'Lo spoglio non assegna la maggioranza assoluta. Trattative attese per settimane.',
    categoria: 'mondo',
    tag: ['Portogallo', 'Elezioni'],
    oreFa: 24,
    firma: 0,
    paragrafi: [
      'Con il novantotto per cento delle sezioni scrutinate nessuna formazione raggiunge la soglia della maggioranza assoluta in Parlamento.',
      'L’affluenza si ferma sei punti sotto quella della consultazione precedente, il valore più basso degli ultimi vent’anni.',
      'Gli osservatori danno per probabile una fase di trattative lunga alcune settimane, con due scenari possibili di governo di minoranza.',
    ],
  },
  {
    titolo: 'Mondiali di atletica, l’Italia chiude con quattro medaglie e due record nazionali',
    sommario: 'Un oro nella marcia, due argenti e un bronzo. Bilancio migliore dell’edizione precedente.',
    categoria: 'sport',
    tag: ['Atletica', 'Mondiali'],
    oreFa: 18,
    copertina: 'cop-11',
    firma: 2,
    paragrafi: [
      'La spedizione azzurra chiude la rassegna con quattro medaglie: un oro nella marcia, due argenti nel mezzofondo e un bronzo nei salti.',
      'Cadono due record nazionali, entrambi nelle staffette, e sei atleti migliorano il proprio primato personale.',
      'Il bilancio supera quello dell’edizione precedente, chiusa con due medaglie. La federazione parla di conferma del lavoro sui gruppi giovanili.',
    ],
  },
  {
    titolo: 'Serie A, il protocollo sugli orari estivi diventa permanente',
    sommario: 'Niente gare nelle ore più calde: la deroga sperimentale entra nel regolamento.',
    categoria: 'sport',
    tag: ['Calcio', 'Regolamenti'],
    oreFa: 22,
    firma: 2,
    paragrafi: [
      'La deroga introdotta in via sperimentale nella scorsa stagione diventa parte stabile del regolamento: nelle giornate con allerta calore le gare non potranno essere fissate nella fascia centrale del pomeriggio.',
      'Il protocollo prevede inoltre due interruzioni per il reidratamento quando l’indice di stress termico supera la soglia stabilita dalla commissione medica.',
      'L’associazione dei calciatori ha giudicato la misura un passo avanti, chiedendo che venga estesa anche alle categorie inferiori.',
    ],
  },
  {
    titolo: 'Ciclismo, la corsa a tappe torna a partire dall’estero: tre frazioni in Slovenia',
    sommario: 'Presentato il percorso: quarantadue chilometri a cronometro e sei arrivi in salita.',
    categoria: 'sport',
    tag: ['Ciclismo', 'Percorso'],
    oreFa: 30,
    copertina: 'cop-12',
    firma: 2,
    paragrafi: [
      'La partenza sarà oltre confine per la quindicesima volta nella storia della corsa: tre frazioni si disputeranno in Slovenia prima del rientro in Friuli.',
      'Il percorso presentato prevede quarantadue chilometri complessivi a cronometro, sei arrivi in salita e due tappe di media montagna nell’ultima settimana.',
      'Gli organizzatori annunciano inoltre la riduzione del numero di squadre invitate, da ventidue a venti, per motivi di sicurezza in gruppo.',
    ],
  },
]

export const PAGINE = [
  {
    slug: 'chi-siamo',
    title: 'Chi siamo',
    footerOrder: 10,
    paragrafi: [
      'Esperia è una testata digitale che racconta l’attualità italiana e internazionale con un lavoro di redazione quotidiano.',
      'Questa è una versione dimostrativa del portale: i contenuti sono di esempio e non costituiscono informazione giornalistica.',
    ],
  },
  {
    slug: 'contatti',
    title: 'Contatti',
    footerOrder: 20,
    paragrafi: [
      'Redazione: redazione@esperia.example',
      'Segnalazioni e correzioni: correzioni@esperia.example',
      'I recapiti di questa pagina sono fittizi e servono soltanto alla dimostrazione.',
    ],
  },
  {
    slug: 'privacy-policy',
    title: 'Privacy policy',
    footerOrder: 30,
    paragrafi: [
      'Il testo definitivo dell’informativa sul trattamento dei dati personali sarà fornito dal Committente prima della pubblicazione.',
      'Questa pagina esiste per mostrare il contenitore previsto dal progetto: la struttura, la navigazione e il collegamento dal banner dei cookie.',
    ],
  },
  {
    slug: 'cookie-policy',
    title: 'Cookie policy',
    footerOrder: 40,
    paragrafi: [
      'Il testo definitivo della cookie policy sarà fornito dal Committente prima della pubblicazione.',
      'Nella versione dimostrativa il banner dei consensi è pienamente funzionante: le preferenze vengono registrate nel browser e gli elementi di terze parti restano bloccati finché non si acconsente.',
    ],
  },
]

export const IMPOSTAZIONI = {
  siteName: 'Esperia',
  tagline: 'Notizie, approfondimenti, community',
  publisherName: 'Esperia S.r.l.',
  legalNotice:
    'Versione dimostrativa. Registrazione al tribunale e dati della testata saranno inseriti prima della pubblicazione.',
  companyDetails: 'Esperia S.r.l. — dati societari da completare',
  editorInChief: 'Direttore responsabile da nominare',
  contactEmail: 'redazione@esperia.example',
  social: [
    { platform: 'facebook', url: 'https://www.facebook.com/' },
    { platform: 'instagram', url: 'https://www.instagram.com/' },
  ],
}
