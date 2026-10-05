import { redirect } from 'next/navigation'

/**
 * Pagina d'ingresso del backoffice (/admin).
 *
 * La Scrivania è sospesa per ora: chi entra arriva direttamente agli
 * articoli. Per riattivarla basta rimettere `Dashboard` come vista
 * `dashboard` in payload.config.ts e la voce in NavLaterale.
 */
export function Ingresso(): never {
  redirect('/admin/collections/articles')
}

export default Ingresso
