import { fileURLToPath } from 'node:url'

import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Il CMS e' un'app di backoffice: non ha pagine pubbliche da ottimizzare.
  // `standalone` serve a poterlo containerizzare senza decidere ora l'hosting (V-02).
  output: 'standalone',
  // fileURLToPath e non URL.pathname: su Windows quest'ultimo produce
  // "/C:/..." e il tracer di Next non riesce a risolverlo.
  outputFileTracingRoot: fileURLToPath(new URL('../../', import.meta.url)),
  experimental: {
    serverActions: {
      // Il limite predefinito e' 1 MB: la copertina generata scelta nel pannello
      // dell'assistente (RF-AI-07) torna al server in base64 e lo supera. 15 MB
      // e' lo stesso tetto dei caricamenti nella media library.
      bodySizeLimit: '15mb',
    },
  },
  images: {
    remotePatterns: [
      ...(process.env.S3_PUBLIC_URL
        ? [{ protocol: 'https', hostname: new URL(process.env.S3_PUBLIC_URL).hostname }]
        : []),
    ],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
