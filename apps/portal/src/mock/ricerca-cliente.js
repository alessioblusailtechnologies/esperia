/*
 * Filtro della ricerca nella versione dimostrativa.
 *
 * Questo file NON viene importato come modulo: la pagina di ricerca lo legge
 * come testo (`?raw`) e lo scrive dentro un tag script solo quando la build e'
 * in modalita' mock. Cosi' il portale reale non porta un byte di JavaScript in
 * piu' sulla pagina di ricerca, che in produzione e' interamente server-side.
 *
 * Vive in un file .js, e non in una stringa dentro il .astro, perche' una
 * stringa costringerebbe a raddoppiare ogni barra rovesciata delle espressioni
 * regolari: illeggibile e facilissimo da sbagliare.
 *
 * Cosa fa: la pagina statica contiene TUTTE le schede, generate dal componente
 * vero e nascoste; qui si decide quali mostrare in base a `?q=` e si costruisce
 * l'evidenza, cioe' il frammento con i termini marcati che nel portale reale
 * arriva gia' pronto da ts_headline.
 */
;(function () {
  var contenitore = document.getElementById('risultati-mock')
  if (!contenitore) return

  var campo = document.getElementById('q-pagina')
  var esito = document.getElementById('esito-mock')
  var vuoto = document.getElementById('stato-vuoto')
  var testoVuoto = vuoto ? vuoto.querySelector('.ricerca__vuoto-testo') : null
  var modulo = campo ? campo.closest('form') : null

  var ENTITA = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

  function normalizza(t) {
    return t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
  }

  function esc(t) {
    return t.replace(/[&<>"']/g, function (c) {
      return ENTITA[c]
    })
  }

  /*
   * Indice costruito una volta sola.
   *
   * Il testo su cui si cerca si ricava dal DOM (titolo e sommario sono gia' in
   * pagina) piu' il corpo dell'articolo, che e' l'unica cosa da trasportare:
   * duplicarli in un attributo raddoppierebbe il peso della pagina per niente.
   */
  var voci = Array.prototype.slice
    .call(contenitore.querySelectorAll('.ricerca__voce'))
    .map(function (el) {
      var titolo = el.querySelector('.scheda__titolo')
      var sommario = el.querySelector('.scheda__sommario')
      var corpo = el.getAttribute('data-corpo') || ''

      return {
        el: el,
        corpo: corpo,
        sommario: sommario,
        sommarioTesto: sommario ? sommario.textContent : '',
        cercabile: normalizza(
          (titolo ? titolo.textContent : '') +
            ' ' +
            (sommario ? sommario.textContent : '') +
            ' ' +
            corpo,
        ),
      }
    })

  function regexTermini(termini) {
    var pattern = termini
      .map(function (t) {
        return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      })
      .join('|')
    return new RegExp('(' + pattern + ')', 'gi')
  }

  /*
   * Marca i termini in un testo.
   *
   * E' l'unico punto in cui questo script scrive HTML: si parte dal testo, lo si
   * escapa e si reintroduce solo <mark> — la stessa regola che segue il CMS
   * quando costruisce l'evidenza lato server (RNF-03).
   */
  function marca(testo, termini) {
    return testo
      .split(regexTermini(termini))
      .map(function (pezzo, i) {
        return i % 2 ? '<mark>' + esc(pezzo) + '</mark>' : esc(pezzo)
      })
      .join('')
  }

  /** Frammento del corpo attorno alla prima occorrenza, come ts_headline. */
  function frammento(corpo, termini) {
    var piano = normalizza(corpo)
    var posizioni = termini
      .map(function (t) {
        return piano.indexOf(t)
      })
      .filter(function (i) {
        return i >= 0
      })
      .sort(function (a, b) {
        return a - b
      })

    if (!posizioni.length) return null

    var inizio = Math.max(0, posizioni[0] - 70)
    var pezzo = corpo.slice(inizio, inizio + 230)
    return (inizio > 0 ? '…' : '') + pezzo + (inizio + 230 < corpo.length ? '…' : '')
  }

  function evidenzia(voce, termini) {
    if (!voce.sommario) return

    if (!termini.length) {
      voce.sommario.textContent = voce.sommarioTesto
      return
    }

    // Prima il sommario: e' la sintesi scritta dalla redazione, e va preferita
    // a un ritaglio automatico quando contiene gia' cio' che si cercava.
    var nelSommario = normalizza(voce.sommarioTesto)
    var presente = termini.some(function (t) {
      return nelSommario.indexOf(t) !== -1
    })

    var testo = presente ? voce.sommarioTesto : (frammento(voce.corpo, termini) ?? voce.sommarioTesto)
    voce.sommario.innerHTML = marca(testo, termini)
  }

  function filtra(grezzo) {
    var q = grezzo.trim()
    var termini = normalizza(q)
      .split(/\s+/)
      .filter(function (t) {
        return t.length >= 2
      })

    var trovati = 0
    voci.forEach(function (voce) {
      var ok =
        termini.length > 0 &&
        termini.every(function (t) {
          return voce.cercabile.indexOf(t) !== -1
        })
      voce.el.hidden = !ok
      if (ok) {
        trovati++
        evidenzia(voce, termini)
      }
    })

    if (esito) {
      esito.hidden = termini.length === 0
      if (termini.length > 0) {
        esito.textContent =
          trovati === 0
            ? 'Nessun risultato per “' + q + '”.'
            : trovati + (trovati === 1 ? ' risultato' : ' risultati') + ' per “' + q + '”.'
      }
    }

    if (vuoto) vuoto.hidden = trovati > 0
    if (testoVuoto) {
      testoVuoto.textContent =
        termini.length > 0
          ? 'Prova con parole diverse, oppure sfoglia una sezione del giornale.'
          : 'Cerca un argomento, un nome o una parola chiave. Oppure parti da una sezione.'
    }
  }

  if (modulo) {
    modulo.addEventListener('submit', function (e) {
      e.preventDefault()
      var q = campo.value.trim()
      history.replaceState(null, '', q ? '/ricerca?q=' + encodeURIComponent(q) : '/ricerca')
      filtra(campo.value)
    })
  }

  if (campo) {
    campo.addEventListener('input', function () {
      filtra(campo.value)
    })
  }

  var iniziale = new URLSearchParams(location.search).get('q') || ''
  if (campo && iniziale) campo.value = iniziale
  filtra(iniziale)
})()
