/** Un'immagine della media library, come la restituisce l'API REST a depth 0. */
export interface ImmagineMedia {
  id: string
  filename?: string | null
  alt?: string | null
  url?: string | null
  mimeType?: string | null
  width?: number | null
  height?: number | null
  createdAt?: string
  sizes?: { thumbnail?: { url?: string | null } | null } | null
}

/** La miniatura generata al caricamento, o il file intero se manca. */
export function miniatura(m: ImmagineMedia): string | undefined {
  return m.sizes?.thumbnail?.url || m.url || undefined
}

export async function leggiImmagine(id: string): Promise<ImmagineMedia | null> {
  const r = await fetch(`/api/media/${encodeURIComponent(id)}?depth=0`, { credentials: 'include' })
  return r.ok ? ((await r.json()) as ImmagineMedia) : null
}
