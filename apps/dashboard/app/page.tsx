/* eslint-disable @next/next/no-css-tags, @next/next/no-page-custom-font */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Script from 'next/script';
import { EarlyAccessModalPortal } from '@/components/landing/early-access-modal-portal';

const LANDING_BODY_PATH = path.join(process.cwd(), 'lib', 'landing', 'landing-body.html');

async function getLandingMarkup() {
  const html = await readFile(LANDING_BODY_PATH, 'utf8');
  return html.replaceAll('{{CURRENT_YEAR}}', String(new Date().getFullYear()));
}

export default async function LandingPage() {
  const landingMarkup = await getLandingMarkup();
  const publicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const publicSupabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

  return (
    <>
      <link href="/landing/css/modal-override.css" rel="stylesheet" />
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link
        href="https://fonts.googleapis.com/css2?family=Inter:wght@100..900&display=swap"
        rel="stylesheet"
      />

      <link href="/landing/vendors/bootstrap/bootstrap.min.css" rel="stylesheet" />
      <link href="/landing/vendors/bootstrap-icons/font/bootstrap-icons.min.css" rel="stylesheet" />
      <link href="/landing/vendors/glightbox/glightbox.min.css" rel="stylesheet" />
      <link href="/landing/vendors/aos/aos.css" rel="stylesheet" />
      <link href="/landing/css/style.css" rel="stylesheet" />

      <div dangerouslySetInnerHTML={{ __html: landingMarkup }} />

      <EarlyAccessModalPortal />

      <Script
        src="/landing/vendors/bootstrap/bootstrap.bundle.min.js"
        strategy="afterInteractive"
      />
      <Script src="/landing/vendors/glightbox/glightbox.min.js" strategy="afterInteractive" />
      <Script src="/landing/vendors/aos/aos.js" strategy="afterInteractive" />
      <Script src="/landing/vendors/purecounter/purecounter.js" strategy="afterInteractive" />
      <Script
        src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
        strategy="afterInteractive"
      />
      <Script
        id="landing-tracking-config"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{
          __html: `window.__LANDING_SUPABASE_URL=${JSON.stringify(publicSupabaseUrl)};window.__LANDING_SUPABASE_ANON_KEY=${JSON.stringify(publicSupabaseAnonKey)};`,
        }}
      />
      <Script src="/landing/js/landing.js" strategy="afterInteractive" />
    </>
  );
}
