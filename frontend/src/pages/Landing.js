import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  Building2,
  Calculator,
  ClipboardCheck,
  Factory,
  FileSpreadsheet,
  Leaf,
  Lock,
  Plane,
  ShieldCheck,
  Users,
  Zap,
} from 'lucide-react';
import { LINKEDIN_URL, OWNER_NAME } from '../config';

// Same numbers the app uses when it calculates (backend/api/views.py).
export const FACTORS = [
  { activity: 'Diesel', unit: 'per litre', value: '2.68', scope: 'Scope 1', note: 'Gallons are converted at 3.785 litres' },
  { activity: 'Grid electricity (India)', unit: 'per kWh', value: '0.82', scope: 'Scope 2', note: 'Utility bills and meter readings' },
  { activity: 'Flight', unit: 'per km', value: '0.255', scope: 'Scope 3', note: 'Business travel' },
  { activity: 'Car', unit: 'per km', value: '0.21', scope: 'Scope 3', note: 'Business travel' },
  { activity: 'Train', unit: 'per km', value: '0.041', scope: 'Scope 3', note: 'Business travel' },
];

const SCOPES = [
  {
    name: 'Scope 1',
    title: 'Direct emissions',
    text: 'Fuel your company burns itself: generators, boilers, company vehicles.',
    example: 'In NexESG: SAP fuel purchases',
    icon: Factory,
  },
  {
    name: 'Scope 2',
    title: 'Purchased energy',
    text: 'Emissions created by the power plant that makes the electricity you buy.',
    example: 'In NexESG: utility bills (kWh)',
    icon: Zap,
  },
  {
    name: 'Scope 3',
    title: 'Everything else in the chain',
    text: 'Travel, suppliers, commuting and more. Usually the biggest share.',
    example: 'In NexESG: corporate travel',
    icon: Plane,
  },
];

const STEPS = [
  {
    icon: FileSpreadsheet,
    title: 'Upload your data',
    text: 'An Analyst uploads CSV exports from SAP (fuel), utilities (electricity) and travel bookings.',
  },
  {
    icon: Calculator,
    title: 'We calculate CO₂e',
    text: 'Units are normalised, the right emission factor is applied, and every record is tagged Scope 1, 2 or 3.',
  },
  {
    icon: ClipboardCheck,
    title: 'A Manager reviews',
    text: 'Each record is approved, flagged or rejected, with a written reason when it is not approved.',
  },
  {
    icon: Lock,
    title: 'Locked for audit',
    text: 'Approved records are locked. Auditors see only approved, read-only data and who signed it off.',
  },
];

const ROLES = [
  ['Admin', 'Sees every company, creates companies, assigns roles to users.'],
  ['Manager', 'Reviews records in their company: approve, flag or reject.'],
  ['Analyst', 'Uploads SAP, utility and travel files and tracks their status.'],
  ['Auditor', 'Read-only view of approved, locked records. Nothing else.'],
  ['Demo (you)', 'Your own private sandbox with sample data: try uploading and reviewing, nobody else can see it.'],
];

const FEATURES = [
  { icon: ShieldCheck, title: 'Permissions enforced on the server', text: 'Roles are checked by the API, not just hidden in the UI.' },
  { icon: Building2, title: 'Company isolation', text: 'Every user only ever sees their own company’s records.' },
  { icon: Lock, title: 'Immutable audit trail', text: 'Approved records cannot be edited. Reviewer and time are stored.' },
  { icon: Users, title: 'Passwordless sign-in', text: 'Continue with Google, or get a one-time code by email.' },
];

const STACK = ['Django REST Framework', 'React', 'Tailwind CSS', 'PostgreSQL', 'JWT', 'Google OAuth', 'Render'];

const FAQ = [
  ['What is ESG?', 'ESG stands for Environmental, Social and Governance: three areas investors, customers and regulators use to judge how responsibly a company operates. NexESG focuses on the “E”: measuring greenhouse-gas emissions.'],
  ['What does CO₂e mean?', 'CO₂-equivalent puts different greenhouse gases on one scale, so a company can report one number. Activity data (litres of diesel, kWh, km flown) is multiplied by an emission factor to get kilograms of CO₂e.'],
  ['Can other people see my data?', 'No. Signing in creates a private demo workspace with sample records. Other visitors cannot see it, and you cannot see theirs.'],
  ['Do I need a Google account?', 'No. You can sign in with Google, or enter your email and we send a 6-digit code.'],
  ['Are these emission factors official?', 'They are simplified demonstration factors. For real reporting, use the published factors for your country and year (for example from the GHG Protocol, your national grid authority or DEFRA).'],
];

const scrollToSection = (id) => () => {
  // Plain anchors (#id) would change the URL hash, which this app uses for routing.
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function LinkedInIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function SectionHeading({ eyebrow, title, children }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-xs font-semibold uppercase tracking-widest text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-semibold text-ink-900 sm:text-3xl">{title}</h2>
      {children && <p className="mt-3 text-sm text-ink-500 sm:text-base">{children}</p>}
    </div>
  );
}

export default function Landing() {
  const nav = [
    ['what-is-esg', 'What is ESG'],
    ['how-it-works', 'How it works'],
    ['emission-factors', 'CO₂ rates'],
    ['roles', 'Roles'],
    ['faq', 'FAQ'],
  ];

  return (
    <div className="min-h-screen bg-white text-ink-800">
      <header className="sticky top-0 z-20 border-b border-ink-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-ink-900">
            <Leaf className="h-6 w-6 text-brand-600" aria-hidden="true" /> NexESG
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm text-ink-600 md:flex">
            {nav.map(([id, label]) => (
              <button key={id} type="button" onClick={scrollToSection(id)} className="hover:text-ink-900">
                {label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
            >
              Sign in
            </Link>
            <Link
              to="/login?mode=signup"
              className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              Sign up
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="bg-gradient-to-b from-brand-50 to-white">
          <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:py-20">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-100 px-3 py-1 text-xs font-medium text-brand-800">
                <Leaf className="h-3.5 w-3.5" aria-hidden="true" /> Emissions data you can trust
              </span>
              <h1 className="mt-4 text-3xl font-semibold leading-tight text-ink-900 sm:text-5xl">
                From source file to audit, in one place.
              </h1>
              <p className="mt-4 max-w-xl text-base text-ink-600">
                NexESG collects fuel, electricity and travel data, turns it into CO₂ emissions (Scope 1, 2 and 3),
                routes it through a manager’s review, and locks approved numbers so auditors can rely on them.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/login?mode=signup"
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-medium text-white hover:bg-brand-700"
                >
                  Try the live demo <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={scrollToSection('how-it-works')}
                  className="rounded-lg border border-ink-200 bg-white px-5 py-3 text-sm font-medium text-ink-700 hover:bg-ink-50"
                >
                  See how it works
                </button>
              </div>
              <p className="mt-3 text-xs text-ink-400">Free. Sign in with Google or an email code. No password.</p>
            </div>

            {/* A real calculation, using the app's own factor */}
            <div className="rounded-2xl border border-ink-100 bg-white p-6 shadow-card" aria-label="Example calculation">
              <p className="text-xs font-semibold uppercase tracking-widest text-ink-400">Example record</p>
              <p className="mt-2 text-sm font-medium text-ink-900">Diesel fuel, Plant A (SAP)</p>
              <div className="mt-5 flex flex-wrap items-center gap-3 text-center">
                <div className="rounded-lg bg-ink-50 px-4 py-3">
                  <p className="text-xl font-semibold text-ink-900">500</p>
                  <p className="text-xs text-ink-500">litres</p>
                </div>
                <span className="text-lg text-ink-400" aria-hidden="true">×</span>
                <div className="rounded-lg bg-ink-50 px-4 py-3">
                  <p className="text-xl font-semibold text-ink-900">2.68</p>
                  <p className="text-xs text-ink-500">kg CO₂e per litre</p>
                </div>
                <span className="text-lg text-ink-400" aria-hidden="true">=</span>
                <div className="rounded-lg bg-brand-600 px-4 py-3 text-white">
                  <p className="text-xl font-semibold">1,340</p>
                  <p className="text-xs text-brand-100">kg CO₂e</p>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-2 text-xs">
                <span className="rounded-full bg-brand-100 px-2.5 py-1 font-medium text-brand-800">Scope 1</span>
                <span className="rounded-full bg-amber-100 px-2.5 py-1 font-medium text-amber-800">Pending review</span>
                <span className="rounded-full bg-ink-100 px-2.5 py-1 font-medium text-ink-600">Then: Approved and locked</span>
              </div>
            </div>
          </div>
        </section>

        {/* What is ESG */}
        <section id="what-is-esg" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="The basics" title="What is ESG, and what is CO₂e?">
            ESG means Environmental, Social and Governance. It is how investors, customers and regulators judge a
            company beyond profit. NexESG covers the Environmental part: measuring greenhouse-gas emissions.
          </SectionHeading>
          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            {SCOPES.map(({ name, title, text, example, icon: Icon }) => (
              <div key={name} className="rounded-xl border border-ink-100 bg-white p-5 shadow-card">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">{name}</p>
                    <h3 className="text-base font-semibold text-ink-900">{title}</h3>
                  </div>
                </div>
                <p className="mt-3 text-sm text-ink-600">{text}</p>
                <p className="mt-3 text-xs font-medium text-ink-500">{example}</p>
              </div>
            ))}
          </div>
          <p className="mx-auto mt-8 max-w-3xl rounded-xl bg-ink-50 p-4 text-center text-sm text-ink-600">
            <strong className="text-ink-800">CO₂e</strong> (carbon dioxide equivalent) puts every greenhouse gas on one scale.
            The formula is always: <strong className="text-ink-800">activity amount × emission factor = kg CO₂e</strong>.
          </p>
        </section>

        {/* How it works */}
        <section id="how-it-works" className="bg-ink-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <SectionHeading eyebrow="How it works" title="Four steps from raw file to audit-ready number" />
            <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map(({ icon: Icon, title, text }, i) => (
                <li key={title} className="rounded-xl bg-white p-5 shadow-card">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
                      {i + 1}
                    </span>
                    <Icon className="h-5 w-5 text-brand-600" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-ink-900">{title}</h3>
                  <p className="mt-1 text-sm text-ink-600">{text}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Emission factors */}
        <section id="emission-factors" className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="CO₂ rates" title="The emission factors NexESG uses today">
            Kilograms of CO₂e produced per unit of activity.
          </SectionHeading>
          <div className="mt-8 overflow-x-auto rounded-xl border border-ink-100 shadow-card">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-ink-50 text-xs uppercase tracking-wide text-ink-500">
                <tr>
                  <th scope="col" className="px-4 py-3">Activity</th>
                  <th scope="col" className="px-4 py-3">kg CO₂e</th>
                  <th scope="col" className="px-4 py-3">Scope</th>
                  <th scope="col" className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {FACTORS.map((f) => (
                  <tr key={f.activity}>
                    <th scope="row" className="px-4 py-3 font-medium text-ink-900">{f.activity}</th>
                    <td className="px-4 py-3 tabular-nums">
                      <strong>{f.value}</strong> <span className="text-ink-500">{f.unit}</span>
                    </td>
                    <td className="px-4 py-3">{f.scope}</td>
                    <td className="px-4 py-3 text-ink-500">{f.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            These are simplified demonstration factors. For real reporting, use the published factors for your
            country and year (for example the GHG Protocol, your national grid authority or DEFRA).
          </p>
        </section>

        {/* Roles */}
        <section id="roles" className="bg-ink-50">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
            <SectionHeading eyebrow="Roles" title="Everyone sees only what their job needs" />
            <dl className="mt-8 divide-y divide-ink-100 overflow-hidden rounded-xl bg-white shadow-card">
              {ROLES.map(([role, text]) => (
                <div key={role} className="grid gap-1 px-5 py-4 sm:grid-cols-4 sm:gap-4">
                  <dt className="font-semibold text-ink-900">{role}</dt>
                  <dd className="text-sm text-ink-600 sm:col-span-3">{text}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <SectionHeading eyebrow="Built carefully" title="Security and audit, not an afterthought" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl border border-ink-100 p-5">
                <Icon className="h-6 w-6 text-brand-600" aria-hidden="true" />
                <h3 className="mt-3 text-base font-semibold text-ink-900">{title}</h3>
                <p className="mt-1 text-sm text-ink-600">{text}</p>
              </div>
            ))}
          </div>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2" aria-label="Technology">
            <BarChart3 className="h-4 w-4 text-ink-400" aria-hidden="true" />
            {STACK.map((s) => (
              <span key={s} className="rounded-full bg-ink-100 px-3 py-1 text-xs font-medium text-ink-600">
                {s}
              </span>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="bg-ink-50">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <SectionHeading eyebrow="FAQ" title="Questions people ask" />
            <div className="mt-8 space-y-3">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group rounded-xl bg-white p-4 shadow-card">
                  <summary className="cursor-pointer list-none text-sm font-semibold text-ink-900">{q}</summary>
                  <p className="mt-2 text-sm text-ink-600">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="bg-brand-900">
          <div className="mx-auto max-w-3xl px-4 py-14 text-center sm:px-6">
            <h2 className="text-2xl font-semibold text-white sm:text-3xl">Explore it with sample data in a minute</h2>
            <p className="mt-2 text-sm text-brand-100">
              Sign in and you get your own private workspace with 12 sample records to approve, flag or reject.
            </p>
            <Link
              to="/login?mode=signup"
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-medium text-brand-800 hover:bg-brand-50"
            >
              Get started <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-ink-500 sm:px-6">
          <p>
            Built by <span className="font-medium text-ink-800">{OWNER_NAME}</span>
          </p>
          <a
            href={LINKEDIN_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${OWNER_NAME} on LinkedIn`}
            className="rounded-md p-1.5 text-ink-500 hover:bg-ink-50 hover:text-[#0A66C2]"
          >
            <LinkedInIcon className="h-6 w-6" />
          </a>
        </div>
      </footer>
    </div>
  );
}
