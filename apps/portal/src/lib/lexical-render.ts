import type { RichTextDocument } from './types'
import { mediaUrl } from './seo'

/**
 * Serializzatore da Lexical a HTML.
 *
 * Scritto a mano invece di usare un convertitore generico per due ragioni:
 * il markup deve essere quello semantico che vogliamo per la SEO e
 * l'accessibilita' (figure/figcaption, heading corretti, rel sui link esterni),
 * e ogni testo che arriva dal CMS viene esplicitamente sanificato qui — e' il
 * punto in cui si previene una XSS stored (RNF-03).
 */

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 1 << 1
const FORMAT_STRIKETHROUGH = 1 << 2
const FORMAT_UNDERLINE = 1 << 3
const FORMAT_CODE = 1 << 4
const FORMAT_SUBSCRIPT = 1 << 5
const FORMAT_SUPERSCRIPT = 1 << 6

/** Host di embed ammessi. Tutto il resto diventa un link, non un iframe. */
const EMBED_CONSENTITI: Record<string, string> = {
  'youtube.com': 'YouTube',
  'www.youtube.com': 'YouTube',
  'youtu.be': 'YouTube',
  'player.vimeo.com': 'Vimeo',
  'vimeo.com': 'Vimeo',
  'x.com': 'X',
  'twitter.com': 'X',
  'www.instagram.com': 'Instagram',
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Blocca javascript:, data: e simili su href provenienti dal CMS. */
function safeHref(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  const value = raw.trim()

  if (value.startsWith('/') || value.startsWith('#')) return value

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:' || url.protocol === 'mailto:') {
      return url.toString()
    }
  } catch {
    return null
  }
  return null
}

type Node = Record<string, any>

function renderText(node: Node): string {
  let out = escapeHtml(String(node.text ?? ''))
  const format = Number(node.format ?? 0)

  if (format & FORMAT_CODE) out = `<code>${out}</code>`
  if (format & FORMAT_BOLD) out = `<strong>${out}</strong>`
  if (format & FORMAT_ITALIC) out = `<em>${out}</em>`
  if (format & FORMAT_UNDERLINE) out = `<u>${out}</u>`
  if (format & FORMAT_STRIKETHROUGH) out = `<s>${out}</s>`
  if (format & FORMAT_SUBSCRIPT) out = `<sub>${out}</sub>`
  if (format & FORMAT_SUPERSCRIPT) out = `<sup>${out}</sup>`

  return out
}

function renderChildren(node: Node): string {
  const children = Array.isArray(node.children) ? node.children : []
  return children.map((c: Node) => renderNode(c)).join('')
}

function renderLink(node: Node): string {
  const fields = node.fields ?? {}
  const href =
    fields.linkType === 'internal' && fields.doc?.value?.slug
      ? `/${fields.doc.value.slug}`
      : safeHref(fields.url)

  const inner = renderChildren(node)
  if (!href) return inner

  const esterno = href.startsWith('http')
  // rel="noopener" e' una misura di sicurezza, non uno stile. RNF-03
  const attrs = [
    `href="${escapeHtml(href)}"`,
    fields.newTab || esterno ? 'target="_blank"' : '',
    esterno ? 'rel="noopener noreferrer"' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return `<a ${attrs}>${inner}</a>`
}

function renderUpload(node: Node): string {
  const media = node.value
  if (!media || typeof media !== 'object') return ''

  const allineamento = node.fields?.alignment ?? 'center'
  const src = mediaUrl(media, allineamento === 'full' ? 'hero' : 'card')
  if (!src) return ''

  const size = media.sizes?.[allineamento === 'full' ? 'hero' : 'card']
  const alt = escapeHtml(String(media.alt ?? ''))
  const didascalia = media.caption ? escapeHtml(String(media.caption)) : ''
  const crediti = media.credit ? escapeHtml(String(media.credit)) : ''

  const dimensioni = size?.width && size?.height ? ` width="${size.width}" height="${size.height}"` : ''

  return [
    `<figure class="figura figura--${escapeHtml(String(allineamento))}">`,
    `<img src="${escapeHtml(src)}" alt="${alt}"${dimensioni} loading="lazy" decoding="async" />`,
    didascalia || crediti
      ? [
          '<figcaption class="figura__didascalia">',
          didascalia ? `<span class="figura__testo">${didascalia}</span>` : '',
          crediti ? `<span class="figura__crediti">${crediti}</span>` : '',
          '</figcaption>',
        ].join('')
      : '',
    `</figure>`,
  ].join('')
}

/**
 * Embed di terze parti.
 *
 * Non inseriamo l'iframe direttamente: caricarlo significherebbe contattare
 * YouTube o X prima che l'utente abbia dato il consenso, cioe' esattamente
 * cio' che RF-P-09 e RNF-04 vietano. Rendiamo un segnaposto; l'iframe viene
 * inserito solo dopo un'azione esplicita (vedi lo script in [slug].astro).
 */
function renderEmbed(fields: Node): string {
  const url = safeHref(fields.url)
  if (!url) return ''

  let host = ''
  try {
    host = new URL(url).hostname
  } catch {
    return ''
  }

  const piattaforma = EMBED_CONSENTITI[host]
  const didascalia = fields.caption ? escapeHtml(String(fields.caption)) : ''

  if (!piattaforma) {
    // Host non riconosciuto: degradiamo a link, mai a iframe arbitrario.
    return `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a></p>`
  }

  return [
    `<figure class="embed" data-embed-url="${escapeHtml(url)}" data-embed-piattaforma="${escapeHtml(piattaforma)}">`,
    `<div class="embed__segnaposto">`,
    `<p>Questo contenuto è ospitato da ${escapeHtml(piattaforma)}. Caricandolo, ${escapeHtml(piattaforma)} potrà raccogliere dati sulla tua navigazione.</p>`,
    `<button type="button" class="embed__carica">Carica contenuto da ${escapeHtml(piattaforma)}</button>`,
    `<p><a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">Apri direttamente su ${escapeHtml(piattaforma)}</a></p>`,
    `</div>`,
    didascalia ? `<figcaption>${didascalia}</figcaption>` : '',
    `</figure>`,
  ].join('')
}

function renderBlock(node: Node): string {
  const fields = node.fields ?? {}
  switch (fields.blockType) {
    case 'quote':
      return [
        '<blockquote class="citazione">',
        `<p class="citazione__testo">${escapeHtml(String(fields.text ?? ''))}</p>`,
        fields.attribution
          ? `<cite class="citazione__fonte">${escapeHtml(String(fields.attribution))}</cite>`
          : '',
        '</blockquote>',
      ].join('')

    case 'embed':
      return renderEmbed(fields)

    default:
      return ''
  }
}

function renderNode(node: Node): string {
  switch (node.type) {
    case 'text':
      return renderText(node)

    case 'linebreak':
      return '<br />'

    case 'paragraph': {
      const inner = renderChildren(node)
      // Lexical produce paragrafi vuoti quando l'autore va a capo: non li rendiamo.
      return inner.trim() ? `<p>${inner}</p>` : ''
    }

    case 'heading': {
      // I titoli partono da h2: l'h1 e' il titolo dell'articolo. RNF-07
      const tag = ['h2', 'h3', 'h4', 'h5', 'h6'].includes(node.tag) ? node.tag : 'h2'
      return `<${tag}>${renderChildren(node)}</${tag}>`
    }

    case 'quote':
      return `<blockquote>${renderChildren(node)}</blockquote>`

    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul'
      return `<${tag}>${renderChildren(node)}</${tag}>`
    }

    case 'listitem':
      return `<li>${renderChildren(node)}</li>`

    case 'link':
    case 'autolink':
      return renderLink(node)

    case 'horizontalrule':
      return '<hr />'

    case 'upload':
      return renderUpload(node)

    case 'block':
      return renderBlock(node)

    default:
      // Nodo sconosciuto (un tipo aggiunto in futuro all'editor): rendiamo i
      // figli invece di far sparire il contenuto.
      return renderChildren(node)
  }
}

export function renderRichText(doc: RichTextDocument | null | undefined): string {
  if (!doc?.root) return ''
  return renderChildren(doc.root as Node)
}

/**
 * Attacco dell'articolo — dai design (Articolo v1).
 *
 * Le prime parole del primo paragrafo sono composte in Newsreader, come nella
 * tradizione tipografica dei quotidiani. Il design le marca a mano; qui la
 * regola e' automatica (le prime due parole) perche' il CMS non ha un campo
 * per questo e chiedere alla redazione di marcarle a ogni pezzo sarebbe un
 * lavoro in piu' per un dettaglio che deve essere costante.
 *
 * Si disattiva togliendo la chiamata in [slug].astro.
 */
/** Numero di parole composte in carattere da titolo all'inizio dell'articolo. */
const PAROLE_ATTACCO = 2

export function applicaAttacco(html: string): string {
  // Solo il primo paragrafo, e solo se comincia con testo (non con un tag:
  // un articolo che si apre con una citazione o un'immagine non ha attacco).
  const apertura = /^(\s*<p>)([^<]+)/.exec(html)
  if (!apertura) return html

  const [intero, tag, testo] = apertura as unknown as [string, string, string]

  const parole = testo.split(/(\s+)/) // conserva i separatori
  let presi = 0
  let taglio = 0
  for (let i = 0; i < parole.length && presi < PAROLE_ATTACCO; i++) {
    taglio += parole[i]!.length
    if (parole[i]!.trim() !== '') presi++
  }

  if (presi === 0) return html

  const marcate = testo.slice(0, taglio)
  const resto = testo.slice(taglio)

  return `${tag}<span class="attacco">${marcate}</span>${resto}${html.slice(intero.length)}`
}
