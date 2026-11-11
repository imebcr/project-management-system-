import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { StoreProvider } from '@/lib/store';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Zidny Projets',
  description: 'Suivi des projets de développement : tâches, cahiers des charges, livrables, serveurs et accès.',
};

export const viewport: Viewport = {
  themeColor: '#E9FCFF',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.variable} font-sans`}>
        <div className="blob blob-1" aria-hidden />
        <div className="blob blob-2" aria-hidden />
        <div className="blob blob-3" aria-hidden />
        <StoreProvider>{children}</StoreProvider>
      </body>
    </html>
  );
}
