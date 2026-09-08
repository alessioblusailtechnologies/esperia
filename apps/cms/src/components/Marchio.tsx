import './Marchio.scss'

/**
 * Marchio della testata nel backoffice — dai design.
 *
 * Sostituisce il logo Payload nella schermata di accesso: chi entra deve
 * vedere il nome del giornale per cui lavora, non quello dello strumento.
 */
export function Logo() {
  return (
    <span className="marchio">
      <span className="marchio__nome">Esperia</span>
      <span className="marchio__sottotitolo">Backoffice editoriale</span>
    </span>
  )
}

/** Versione compatta, usata dove c'e' poco spazio. */
export function Icona() {
  return <span className="marchio marchio--icona">E</span>
}

export default Logo
