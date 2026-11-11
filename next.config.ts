import type { NextConfig } from 'next';

/**
 * En développement, /api et /s sont redirigés vers Django (même origine : cookies et pas de CORS).
 * En production, Nginx fait ce routage (voir deploy/nginx.conf) ; cette réécriture sert de repli.
 */
const BACKEND_URL = process.env.BACKEND_URL ?? 'http://127.0.0.1:8000';

const nextConfig: NextConfig = {
  // Dossier de build séparé possible (ex. un 2e serveur pour des essais) : NEXT_DIST_DIR=.next-essai
  distDir: process.env.NEXT_DIST_DIR || '.next',
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      { source: '/api/:path*', destination: `${BACKEND_URL}/api/:path*` },
      { source: '/s/:token', destination: `${BACKEND_URL}/s/:token` },
    ];
  },
};

export default nextConfig;
