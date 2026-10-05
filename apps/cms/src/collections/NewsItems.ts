import type { CollectionConfig } from 'payload'
import { isEditor } from '@/access'

/**
 * Notizie lette dalle fonti — materia prima degli hot topic, RF-AI-01.
 *
 * Servono perche' un argomento diventa caldo nel tempo: la prima testata ne
 * parla alle 9, la seconda alle 11. Se il job tenesse solo cio' che ha letto
 * nell'ultimo giro, quelle due notizie non si incontrerebbero mai e nessun
 * argomento supererebbe la soglia di volume. Qui restano per una settimana,
 * poi il job stesso le cancella.
 *
 * Non sono contenuti: nessuno le scrive a mano, la redazione le consulta
 * attraverso gli hot topic. L'elenco resta visibile agli editor per capire
 * che cosa le fonti stanno restituendo quando un argomento atteso non compare.
 */
export const NewsItems: CollectionConfig = {
  slug: 'news-items',
  labels: { singular: 'Notizia letta', plural: 'Notizie lette dalle fonti' },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'publisher', 'publishedAt', 'source'],
    group: 'Intelligenza artificiale',
    description:
      'Notizie raccolte dalle fonti negli ultimi sette giorni. Le scrive e le cancella il job di rilevamento degli hot topic.',
  },
  access: {
    read: isEditor,
    create: () => false, // solo il job, con overrideAccess
    update: () => false,
    delete: () => false,
  },
  defaultSort: '-publishedAt',
  timestamps: true,
  fields: [
    { name: 'title', type: 'text', required: true, label: 'Titolo' },
    { name: 'url', type: 'text', required: true, unique: true, index: true, label: 'URL' },
    { name: 'publisher', type: 'text', label: 'Testata' },
    { name: 'publishedAt', type: 'date', required: true, index: true, label: 'Pubblicata il' },
    { name: 'excerpt', type: 'textarea', label: 'Estratto' },
    {
      name: 'source',
      type: 'relationship',
      relationTo: 'sources',
      required: true,
      label: 'Fonte',
    },
  ],
}
