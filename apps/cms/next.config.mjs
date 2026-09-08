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
  images: {
    remotePatterns: [
      ...(process.env.S3_PUBLIC_URL
        ? [{ protocol: 'https', hostname: new URL(process.env.S3_PUBLIC_URL).hostname }]
        : []),
    ],
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
