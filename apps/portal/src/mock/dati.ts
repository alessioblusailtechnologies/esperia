import type {
  Article,
  Author,
  Category,
  Media,
  Page,
  RichTextDocument,
  SiteSettings,
  Tag,
} from '@/lib/types'
import { ARTICOLI, AUTORI, CATEGORIE, IMPOSTAZIONI, PAGINE } from './contenuti'
import { COPERTINE } from './copertine'

/**
 * Costruisce le entita' che il portale si aspetta dall'API del CMS, a partire
 * dai contenuti dimostrativi.
 *
 * Le entita' rispettano `lib/types.ts`, cioe' lo stesso contratto HTTP che
 * Payload deve onorare in produzione: se il contratto cambia, il typecheck
 * rompe anche qui e la divergenza si vede subito.
 *
 * Costruito una volta sola all'avvio del processo (o della build statica).
 */

function slugify(testo: string): string {
  return testo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 75)
    .replace(/-+$/g, '')
}

/** Stessa forma prodotta da bozzaInLexical nel CMS. */
function lexical(paragrafi: string[]): RichTextDocument {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      version: 1,
      direction: 'ltr',
      children: paragrafi.map((testo) => ({
        type: 'paragraph',
        format: '',
        indent: 0,
        version: 1,
        direction: 'ltr',
        textFormat: 0,
        children: [
          {
            type: 'text',
            text: testo,
            format: 0,
            style: '',
            mode: 'normal',
            detail: 0,
            version: 1,
          },
        ],
      })),
    },
  }
}

/** Le stesse quattro varianti generate da Payload — vedi collections/Media.ts. */
const VARIANTI = {
  thumbnail: { width: 400, height: 300 },
  card: { width: 768, height: 512 },
  hero: { width: 1600, height: 900 },
  og: { width: 1200, height: 630 },
} as const

/**
 * Immagine di copertina.
 *
 * Testo alternativo e crediti vengono da `copertine.ts`, generato dallo script
 * che scarica le fotografie: l'attribuzione richiesta dalle licenze CC deve
 * restare agganciata al file, non essere riscritta a mano qui.
 */
function media(slug: string): Media {
  const dati = COPERTINE[slug]
  if (!dati) throw new Error(`Copertina senza provenienza: ${slug}`)

  const sizes = Object.fromEntries(
    Object.entries(VARIANTI).map(([nome, dim]) => [
      nome,
      { url: `/mock/media/${slug}-${nome}.webp`, width: dim.width, height: dim.height },
    ]),
  ) as Media['sizes']

  return {
    id: slug,
    url: `/mock/media/${slug}.webp`,
    alt: dati.alt,
    credit: dati.credito,
    width: 1600,
    height: 900,
    mimeType: 'image/webp',
    sizes,
  }
}

/* -------------------------------------------------------------------------- */
/* Entita'                                                                    */
/* -------------------------------------------------------------------------- */

export const categorie: Category[] = CATEGORIE.map((c, i) => ({
  id: `c${i + 1}`,
  name: c.name,
  slug: c.slug,
  description: c.description,
  color: c.color,
  order: c.order,
  showInMenu: true,
}))

const perSlugCategoria = new Map(categorie.map((c) => [c.slug, c]))

export const autori: Author[] = AUTORI.map((a) => ({
  id: a.id,
  name: a.nome,
  bio: a.bio,
  avatar: null,
}))

/* I tag nascono dagli articoli, come nel seed del CMS. */
const tagPerSlug = new Map<string, Tag>()
for (const a of ARTICOLI) {
  for (const nome of a.tag) {
    const slug = slugify(nome)
    if (!tagPerSlug.has(slug)) {
      tagPerSlug.set(slug, { id: `t${tagPerSlug.size + 1}`, name: nome, slug })
    }
  }
}
export const tag: Tag[] = [...tagPerSlug.values()]

/**
 * Data di pubblicazione calcolata all'avvio: gli articoli restano "di oggi"
 * a ogni build, invece di invecchiare come farebbe una data fissa.
 */
const ADESSO = Date.now()

/** ~200 parole al minuto, arrotondato per eccesso, come fa il CMS. */
function minutiDiLettura(paragrafi: string[]): number {
  const parole = paragrafi.join(' ').split(/\s+/).filter(Boolean).length
  return Math.max(1, Math.round(parole / 200))
}

export const articoli: Article[] = ARTICOLI.map((a, i) => {
  const categoria = perSlugCategoria.get(a.categoria)
  if (!categoria) throw new Error(`Categoria sconosciuta nei contenuti mock: ${a.categoria}`)

  const pubblicatoIl = new Date(ADESSO - a.oreFa * 3_600_000).toISOString()
  const copertina = a.copertina ? media(a.copertina) : null

  return {
    id: `art${String(i + 1).padStart(2, '0')}`,
    slug: slugify(a.titolo),
    title: a.titolo,
    kicker: a.occhiello ?? null,
    subtitle: a.sottotitolo ?? null,
    excerpt: a.sommario,
    content: lexical(a.paragrafi),
    heroImage: copertina,
    category: categoria,
    tags: a.tag.map((nome) => tagPerSlug.get(slugify(nome))!),
    authors: [autori[a.firma % autori.length]!],
    publishedAt: pubblicatoIl,
    updatedAt: pubblicatoIl,
    createdAt: pubblicatoIl,
    featured: Boolean(a.inEvidenza),
    readingMinutes: minutiDiLettura(a.paragrafi),
    relatedArticles: [],
    seo: null,
    ai: null,
    _status: 'published',
  }
})

/** Ordine di pubblicazione decrescente: e' l'unico ordinamento che il portale chiede. */
export const articoliRecenti: Article[] = [...articoli].sort(
  (a, b) => Date.parse(b.publishedAt ?? '') - Date.parse(a.publishedAt ?? ''),
)

export const pagine: Page[] = PAGINE.map((p, i) => ({
  id: `p${i + 1}`,
  slug: p.slug,
  title: p.title,
  content: lexical(p.paragrafi),
  showInFooter: true,
  footerOrder: p.footerOrder,
  seo: null,
  updatedAt: new Date(ADESSO - 72 * 3_600_000).toISOString(),
}))

const perSlugPagina = new Map(pagine.map((p) => [p.slug, p]))

export const impostazioni: SiteSettings = {
  ...IMPOSTAZIONI,
  logo: null,
  defaultOgImage: media('cop-01'),
  featuredArticles: articoliRecenti.filter((a) => a.featured).slice(0, 4),
  homeSections: [
    { category: perSlugCategoria.get('politica')!, title: 'Politica', limit: 4 },
    { category: perSlugCategoria.get('economia')!, title: 'Economia', limit: 4 },
    { category: perSlugCategoria.get('cronaca')!, title: 'Cronaca', limit: 4 },
  ],
  twitterHandle: null,
  cookieBanner: {
    enabled: true,
    privacyPage: perSlugPagina.get('privacy-policy') ?? null,
    cookiePage: perSlugPagina.get('cookie-policy') ?? null,
  },
  analytics: { provider: 'nessuno' },
  maintenanceMode: false,
  maintenanceMessage: null,
}

/** Testo semplice di un articolo: serve alla ricerca e all'indice statico. */
export function testoPiano(a: Article): string {
  const paragrafi = ARTICOLI.find((x) => slugify(x.titolo) === a.slug)?.paragrafi ?? []
  return paragrafi.join(' ')
}
