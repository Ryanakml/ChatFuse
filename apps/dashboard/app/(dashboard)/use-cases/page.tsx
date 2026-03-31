import Link from 'next/link';
import { USE_CASE_ARTICLES } from '@/lib/landing/use-case-articles';
import './[slug]/use-case.css';

export default function UseCasesIndexPage() {
  return (
    <main className="use-case-page">
      <header className="use-case-header py-3 py-md-4">
        <div className="container d-flex align-items-center justify-content-between gap-3">
          <Link
            href="/"
            className="use-case-brand text-decoration-none"
            aria-label="Chattiphy Home"
          >
            <span style={{ fontWeight: 700, fontSize: 24 }}>Chattiphy</span>
          </Link>
        </div>
      </header>
      <section className="use-case-hero pt-4 pt-md-5 pb-4 pb-md-5">
        <div className="container">
          <div className="use-case-reading-width mx-auto">
            <h1 className="use-case-title mb-3">Use Cases</h1>
            <p className="use-case-label mb-0">
              Explore how Chattiphy can help your clinic or business.
            </p>
          </div>
        </div>
      </section>
      <section className="pb-5 pb-md-6">
        <div className="container">
          <div className="use-case-reading-width mx-auto">
            <ul className="list-unstyled">
              {USE_CASE_ARTICLES.map((article) => (
                <li key={article.slug} className="mb-4">
                  <Link href={`/use-cases/${article.slug}`} className="text-decoration-none">
                    <div className="p-3 border rounded-3 h-100 d-flex flex-column gap-1">
                      <span className="fw-semibold text-uppercase text-muted small">
                        {article.category}
                      </span>
                      <span className="fs-5 fw-bold">{article.clinicLabel}</span>
                      <span className="text-body-secondary">{article.heroTitle}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
