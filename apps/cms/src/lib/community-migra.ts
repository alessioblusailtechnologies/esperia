/**
 * Applica le migrazioni della community (schema `esperia`) a un progetto
 * Supabase — RF-C-01..07.
 *
 *   pnpm --filter @esperia/cms community:migra            # controlla soltanto
 *   pnpm --filter @esperia/cms community:migra --applica  # applica ed espone lo schema
 *
 * Due modi di arrivare al database, il primo disponibile:
 *  - SUPABASE_ACCESS_TOKEN (token personale) + SUPABASE_URL: Management API di
 *    Supabase. Serve quando l'unica connessione diretta disponibile e' un utente
 *    applicativo senza permessi sullo schema `auth` (come in prova);
 *  - ESPERIA_COMMUNITY_DB_URL: connessione diretta da amministratore. Separata da
 *    DATABASE_URI: il database di Payload e quello della community possono essere
 *    diversi.
 *
 * Pensato per un progetto che puo' ospitare altre applicazioni, quindi prudente:
 * si ferma se lo schema `esperia` esiste gia' con delle tabelle, mostra i trigger
 * presenti su auth.users prima di aggiungerne uno, e applica 0001, 0003 e 0004
 * in un'unica transazione. Se qualcosa fallisce non resta nulla a meta'.
 *
 * Lo schema viene esposto all'API solo DOPO la migrazione: PostgREST va in
 * errore se gli si chiede uno schema che non esiste, e con lui l'API delle altre
 * applicazioni del progetto (verificato in locale). Con la connessione diretta
 * l'esposizione resta da fare a mano (Settings → API → Exposed schemas).
 */
import 'dotenv/config'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const MIGRAZIONI = ['0001_community.sql', '0003_cancellazione_account.sql', '0004_antispam.sql']
const SCHEMA = 'esperia'
const cartella = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../supabase/migrations',
)
const applica = process.argv.includes('--applica')

type Riga = Record<string, unknown>

interface Accesso {
  descrizione: string
  query(sql: string, soloLettura?: boolean): Promise<Riga[]>
  esponiSchema?(): Promise<string>
  chiudi(): Promise<void>
}

/* -------------------------------------------------------------------------- */

function viaManagementApi(token: string, supabaseUrl: string): Accesso {
  const ref = new URL(supabaseUrl).hostname.split('.')[0]!
  const base = `https://api.supabase.com/v1/projects/${ref}`
  const chiama = async (percorso: string, init: RequestInit) => {
    const r = await fetch(`${base}${percorso}`, {
      ...init,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
    const corpo = await r.json().catch(() => null)
    if (!r.ok) {
      const messaggio = (corpo as { message?: string } | null)?.message ?? r.statusText
      throw new Error(`Management API ${r.status}: ${messaggio}`)
    }
    return corpo
  }

  return {
    descrizione: `Management API, progetto ${ref}`,
    async query(sql, soloLettura = false) {
      const righe = await chiama('/database/query', {
        method: 'POST',
        body: JSON.stringify({ query: sql, read_only: soloLettura }),
      })
      return Array.isArray(righe) ? (righe as Riga[]) : []
    },
    async esponiSchema() {
      const attuale = (await chiama('/postgrest', { method: 'GET' })) as { db_schema: string }
      const schemi = attuale.db_schema
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (schemi.includes(SCHEMA)) return `già esposto (${attuale.db_schema})`
      const nuovo = [...schemi, SCHEMA].join(', ')
      await chiama('/postgrest', { method: 'PATCH', body: JSON.stringify({ db_schema: nuovo }) })
      return `esposto: ${nuovo}`
    },
    async chiudi() {},
  }
}

async function viaConnessione(url: string): Promise<Accesso> {
  // Supabase ospitato vuole SSL; il database locale della CLI non lo offre.
  const locale = /@(localhost|127\.0\.0\.1)(:|\/)/.test(url)
  const client = new pg.Client({
    connectionString: url,
    ssl: locale ? false : { rejectUnauthorized: false },
  })
  await client.connect()
  return {
    descrizione: 'connessione diretta',
    async query(sql) {
      const r = await client.query(sql)
      // Con piu' istruzioni pg restituisce un risultato per ciascuna: conta l'ultima.
      const ultimo = Array.isArray(r) ? r[r.length - 1] : r
      return (ultimo?.rows ?? []) as Riga[]
    },
    chiudi: () => client.end(),
  }
}

/* -------------------------------------------------------------------------- */

const token = process.env.SUPABASE_ACCESS_TOKEN
const supabaseUrl = process.env.SUPABASE_URL
const dbUrl = process.env.ESPERIA_COMMUNITY_DB_URL

let accesso: Accesso
if (token && supabaseUrl) accesso = viaManagementApi(token, supabaseUrl)
else if (dbUrl) accesso = await viaConnessione(dbUrl)
else {
  console.error(
    'Servono SUPABASE_ACCESS_TOKEN + SUPABASE_URL, oppure ESPERIA_COMMUNITY_DB_URL, in apps/cms/.env.',
  )
  process.exit(1)
}

const testoMigrazione = () =>
  [
    'begin;',
    `do $$ begin
       if exists (select 1 from pg_tables where schemaname = '${SCHEMA}') then
         raise exception 'Lo schema ${SCHEMA} esiste già con delle tabelle.';
       end if;
     end $$;`,
    ...MIGRAZIONI.map((nome) => readFileSync(path.join(cartella, nome), 'utf8')),
    'commit;',
    // Se lo schema e' gia' esposto, PostgREST deve rileggere tabelle e funzioni.
    "notify pgrst, 'reload schema';",
  ].join('\n\n')

try {
  console.log(`Accesso: ${accesso.descrizione}`)

  const [info] = await accesso.query(
    "select current_database() as db, current_user as utente, split_part(version(), ' ', 2) as versione",
    true,
  )
  console.log(`Database "${info?.db}", utente ${info?.utente}, PostgreSQL ${info?.versione}.`)

  const [conteggio] = await accesso.query(
    `select count(*)::int as n from pg_tables where schemaname = '${SCHEMA}'`,
    true,
  )
  const giaPresenti = Number(conteggio?.n ?? 0)

  const trigger = await accesso.query(
    "select tgname from pg_trigger where tgrelid = 'auth.users'::regclass and not tgisinternal order by tgname",
    true,
  )
  console.log(
    `Trigger già presenti su auth.users: ${trigger.map((t) => t.tgname).join(', ') || 'nessuno'}`,
  )

  const estensioni = await accesso.query(
    "select extname, extnamespace::regnamespace::text as schema from pg_extension where extname in ('unaccent', 'pg_trgm')",
    true,
  )
  console.log(
    `Estensioni: ${estensioni.map((e) => `${e.extname} (${e.schema})`).join(', ') || 'nessuna: verranno create'}`,
  )

  const [omonimo] = await accesso.query(
    `select count(*)::int as n from pg_namespace where nspname = '${SCHEMA}'`,
    true,
  )
  console.log(
    `Schema ${SCHEMA}: ${giaPresenti > 0 ? `esiste, con ${giaPresenti} tabelle` : Number(omonimo?.n) ? 'esiste, vuoto' : 'non esiste'}`,
  )

  if (giaPresenti > 0) {
    console.log(`\nLo schema ${SCHEMA} ha già delle tabelle: non applico nulla.`)
  } else if (!applica) {
    console.log('\nControllo completato, nessuna modifica. Per applicare: aggiungere --applica.')
  } else {
    process.stdout.write(`\nApplico ${MIGRAZIONI.join(', ')} in una transazione… `)
    await accesso.query(testoMigrazione())
    console.log('ok')

    const [create] = await accesso.query(
      `select string_agg(tablename, ', ' order by tablename) as elenco from pg_tables where schemaname = '${SCHEMA}'`,
      true,
    )
    console.log(`Tabelle in ${SCHEMA}: ${create?.elenco}`)

    if (accesso.esponiSchema) {
      console.log(`Schema per l'API: ${await accesso.esponiSchema()}`)
    } else {
      console.log(`Ora: Settings → API → Exposed schemas, aggiungere "${SCHEMA}".`)
    }
  }
} catch (err) {
  console.error(`\nInterrotto, nessuna modifica applicata: ${(err as Error).message}`)
  process.exitCode = 1
} finally {
  await accesso.chiudi()
}
