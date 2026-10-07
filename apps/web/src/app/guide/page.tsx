import type { Metadata } from 'next';
import Link from 'next/link';
import { Fragment } from 'react';

// Public guide for people being invited to try ABRO (shared from the
// Telegram channel): what it is, what it does, how to install it, and
// answers to the obvious questions. Plain language on purpose -- no
// technical terms. A static server page: no sign-in and no API calls, so
// anyone with the link can read it. Only describes features that exist
// today; update it when that changes (and the install section when ABRO
// reaches the App Store / Play Store).

export const metadata: Metadata = {
  title: 'ABRO · Guide',
  description:
    'Track shared expenses with friends, family and groups in birr. See who owes whom, settle up, and install ABRO on your phone.',
  openGraph: {
    title: 'ABRO · Remember every expense. Forget the confusion.',
    description:
      'Track shared expenses with friends, family and groups in birr. See who owes whom, settle up, and install ABRO on your phone.',
    images: [{ url: '/icons/icon-512.png', width: 512, height: 512, alt: 'ABRO' }],
    type: 'website',
  },
};

const gradientText = {
  background: 'linear-gradient(135deg, #6366f1, #a855f7)',
  WebkitBackgroundClip: 'text',
  WebkitTextFillColor: 'transparent',
} as const;
const primary = { color: 'var(--t-primary)' } as const;
const secondary = { color: 'var(--t-secondary)' } as const;
const dim = { color: 'var(--t-dim)' } as const;

const FEATURES = [
  {
    icon: '🧾',
    title: 'Add any expense',
    body: 'Dinner, rent, a taxi, a trip. Say who paid and who it was for, and ABRO works out everyone’s share.',
  },
  {
    icon: '➗',
    title: 'Split it your way',
    body: 'Equally, by exact amounts, by percentages, or by shares (say one person had twice as much). The total always adds up.',
  },
  {
    icon: '🤝',
    title: 'Quick IOUs',
    body: 'Lent someone money? Record it in seconds so neither of you has to remember.',
  },
  {
    icon: '👥',
    title: 'Groups',
    body: 'Make a group for a trip, your household, family or team. Invite friends and keep all its expenses in one place.',
  },
  {
    icon: '⚖️',
    title: 'Always-correct balances',
    body: 'Home shows what you owe and what you’re owed, overall, per friend and per group, in birr.',
  },
  {
    icon: '✨',
    title: 'Fewer payments',
    body: '“Simplify” finds the smallest number of payments that settles a whole group, so nobody pays back and forth.',
  },
  {
    icon: '✅',
    title: 'Settle up',
    body: 'When someone pays you back, in cash, telebirr or by bank, record it in full or in part and the balance updates.',
  },
  {
    icon: '📷',
    title: 'Receipts',
    body: 'Attach a photo of the receipt to an expense, so everyone on it can see it later.',
  },
  {
    icon: '🔎',
    title: 'Activity and search',
    body: 'Every expense and payment in one timeline, and search to find any of them by name, category or note.',
  },
  {
    icon: '🔔',
    title: 'Notifications',
    body: 'Know when a friend adds you to an expense, invites you to a group or settles up. Choose which ones you get.',
  },
];

const STEPS = [
  {
    title: 'Sign in',
    body: 'With your email (we send you a 6-digit code) or your Google account. Pick a username so friends can find you.',
  },
  {
    title: 'Add your friends',
    body: 'Search for their username, or send them your invite link or QR code from Add Friend. They accept with one tap.',
  },
  {
    title: 'Add an expense',
    body: 'Tap Add, enter the amount, who paid and who shared it. Everyone on it sees it straight away.',
  },
  {
    title: 'Settle up',
    body: 'Pay each other back however you like, then record it in ABRO. Balances go to zero, and the history stays.',
  },
];

const INSTALL = [
  {
    id: 'iphone',
    title: 'iPhone',
    steps: [
      <Fragment key="s1">
        Open <strong style={primary}>abro-pi.vercel.app</strong> in{' '}
        <strong style={primary}>Safari</strong>.
      </Fragment>,
      <Fragment key="s2">
        Tap the <strong style={primary}>Share</strong> button (the square with an arrow pointing
        up).
      </Fragment>,
      <Fragment key="s3">
        Scroll down and tap <strong style={primary}>Add to Home Screen</strong>, then{' '}
        <strong style={primary}>Add</strong>.
      </Fragment>,
      <Fragment key="s4">
        Open ABRO from your home screen and sign in. (The app signs in separately from Safari, so
        you sign in once more. The email code is the easiest way.)
      </Fragment>,
    ],
  },
  {
    id: 'android',
    title: 'Android',
    steps: [
      <Fragment key="s5">
        Open <strong style={primary}>abro-pi.vercel.app</strong> in{' '}
        <strong style={primary}>Chrome</strong> and sign in.
      </Fragment>,
      <Fragment key="s6">
        Tap <strong style={primary}>Install</strong> on the &ldquo;Get the ABRO app&rdquo; card on
        the home screen. Or tap Chrome&apos;s <strong style={primary}>⋮</strong> menu, then{' '}
        <strong style={primary}>Install app</strong> (or{' '}
        <strong style={primary}>Add to Home screen</strong>).
      </Fragment>,
      <Fragment key="s7">Confirm, and ABRO appears with your other apps.</Fragment>,
    ],
  },
  {
    id: 'computer',
    title: 'Computer',
    steps: [
      <Fragment key="s8">
        Just use it in your browser at <strong style={primary}>abro-pi.vercel.app</strong>.
      </Fragment>,
      <Fragment key="s9">
        Optional: in <strong style={primary}>Chrome</strong> or{' '}
        <strong style={primary}>Edge</strong>, click the install icon at the right end of the
        address bar to get ABRO as its own window.
      </Fragment>,
    ],
  },
];

const FAQ = [
  {
    q: 'Does ABRO move money?',
    a: 'No. ABRO only keeps the record. You pay each other the way you normally do (cash, telebirr, bank transfer) and then record the payment in ABRO, so everyone agrees on who owes what.',
  },
  {
    q: 'Is it free?',
    a: 'Yes. ABRO is free while we test it with friends and family.',
  },
  {
    q: 'Who can see my expenses?',
    a: 'Only the people on an expense, or the members of its group, can see it. Receipts are private to them too. Nobody can browse other people’s accounts. Friends find you only by your exact username, email or phone.',
  },
  {
    q: 'Do I need to download anything from a store?',
    a: 'No. ABRO installs straight from the website (see “Install ABRO” above). It opens full screen from your home screen like any other app, and it updates itself.',
  },
  {
    q: 'It took a while to open. Is something wrong?',
    a: 'During testing, ABRO goes to sleep when nobody has used it for a few minutes. The first person to open it after that may wait up to a minute while it wakes up. After that it’s quick.',
  },
  {
    q: 'I didn’t get my sign-in code.',
    a: 'Check your spam or promotions folder. Codes can land there for now. You can ask for a new code after a minute.',
  },
  {
    q: 'Does it work without internet?',
    a: 'No. ABRO needs a connection so your balances are always up to date. Without one you’ll see a short “You’re offline” screen.',
  },
  {
    q: 'Something isn’t working, or I have an idea.',
    a: 'Tell us in the ABRO Telegram channel. Every piece of feedback helps while we’re testing.',
  },
];

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      <p
        className="font-display text-[0.75rem] font-bold uppercase tracking-[0.08em]"
        style={{ color: 'var(--accent)' }}
      >
        {eyebrow}
      </p>
      <h2
        className="font-display text-[1.6rem] font-bold tracking-tight md:text-[1.9rem]"
        style={primary}
      >
        {title}
      </h2>
    </div>
  );
}

export default function GuidePage() {
  return (
    <main className="fade-in mx-auto flex max-w-5xl flex-col gap-16 px-5 py-10 md:gap-20 md:px-8 md:py-16">
      {/* Hero */}
      <section className="flex flex-col items-center gap-6 text-center">
        <div
          className="neo-raised-lg flex h-[88px] w-[88px] items-center justify-center rounded-[28px]"
          aria-hidden
        >
          <span
            className="font-display text-[2.1rem] font-extrabold tracking-tighter"
            style={gradientText}
          >
            AB
          </span>
        </div>
        <div className="flex flex-col gap-3">
          <h1
            className="font-display text-[2.2rem] font-extrabold leading-tight tracking-tight md:text-[3rem]"
            style={primary}
          >
            Remember every expense.
            <br />
            <span style={gradientText}>Forget the confusion.</span>
          </h1>
          <p
            className="mx-auto max-w-xl text-[1rem] leading-relaxed md:text-[1.1rem]"
            style={secondary}
          >
            ABRO keeps track of money you share with friends, family and groups, in birr. Who paid,
            who owes whom, and how to settle up, without anyone having to remember.
          </p>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-3 sm:max-w-none sm:flex-row sm:justify-center">
          <Link
            href="/home"
            className="neo-btn-accent font-display rounded-2xl px-7 py-3.5 text-[0.95rem] font-semibold"
          >
            Open ABRO
          </Link>
          <a
            href="#install"
            className="neo-btn font-display rounded-2xl px-7 py-3.5 text-[0.95rem] font-semibold"
            style={secondary}
          >
            Install on your phone
          </a>
        </div>
        <p className="text-[0.8rem]" style={dim}>
          Free · Works on iPhone, Android and computer · No app store needed
        </p>
      </section>

      {/* How it works */}
      <section>
        <SectionTitle eyebrow="How it works" title="Up and running in four steps" />
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="neo-raised-sm flex flex-col gap-2.5 rounded-[20px] p-5">
              <span
                className="font-display flex h-8 w-8 items-center justify-center rounded-full text-[0.85rem] font-bold text-white"
                style={{ background: 'linear-gradient(135deg, #6366f1, #a855f7)' }}
              >
                {i + 1}
              </span>
              <h3 className="font-display text-[1.05rem] font-bold" style={primary}>
                {step.title}
              </h3>
              <p className="text-[0.88rem] leading-relaxed" style={dim}>
                {step.body}
              </p>
            </li>
          ))}
        </ol>
      </section>

      {/* Features */}
      <section>
        <SectionTitle eyebrow="Features" title="Everything you need to share costs fairly" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="neo-raised-sm flex gap-4 rounded-[20px] p-5">
              <div
                className="neo-inset-sm flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[1.3rem]"
                aria-hidden
              >
                {f.icon}
              </div>
              <div className="flex flex-col gap-1.5">
                <h3 className="font-display text-[1rem] font-bold" style={primary}>
                  {f.title}
                </h3>
                <p className="text-[0.86rem] leading-relaxed" style={dim}>
                  {f.body}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Install */}
      <section id="install" className="scroll-mt-8">
        <SectionTitle eyebrow="Install ABRO" title="Put ABRO on your home screen" />
        <p className="-mt-2 mb-6 max-w-2xl text-[0.92rem] leading-relaxed" style={secondary}>
          ABRO installs straight from its website. There&apos;s nothing to download from a store.
          Once added, it opens full screen from its own icon, just like any other app, and always
          has the latest version.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          {INSTALL.map((platform) => (
            <div
              key={platform.id}
              id={platform.id}
              className="neo-raised-sm flex flex-col gap-4 rounded-[20px] p-5"
            >
              <h3 className="font-display text-[1.15rem] font-bold" style={primary}>
                {platform.title}
              </h3>
              <ol className="flex flex-col gap-3">
                {platform.steps.map((step, i) => (
                  <li
                    key={step.key}
                    className="flex gap-3 text-[0.88rem] leading-relaxed"
                    style={secondary}
                  >
                    <span
                      className="font-display mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.75rem] font-bold"
                      style={{ background: 'var(--accent-light)', color: 'var(--accent)' }}
                    >
                      {i + 1}
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section>
        <SectionTitle eyebrow="Questions" title="Good to know" />
        <div className="flex flex-col gap-3">
          {FAQ.map((item) => (
            <details key={item.q} className="neo-raised-sm group rounded-[18px] px-5 py-4">
              <summary
                className="font-display flex cursor-pointer list-none items-center justify-between gap-4 text-[0.98rem] font-semibold"
                style={primary}
              >
                {item.q}
                <span
                  className="text-[1.2rem] transition-transform group-open:rotate-45"
                  style={{ color: 'var(--accent)' }}
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="mt-3 text-[0.9rem] leading-relaxed" style={dim}>
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </section>

      {/* Closing call to action */}
      <section className="neo-raised-sm flex flex-col items-center gap-4 rounded-[24px] px-6 py-10 text-center">
        <h2 className="font-display text-[1.5rem] font-bold tracking-tight" style={primary}>
          Ready to stop doing the maths?
        </h2>
        <p className="max-w-md text-[0.92rem]" style={dim}>
          Sign in, add a friend, and record your first shared expense. It takes about a minute.
        </p>
        <Link
          href="/home"
          className="neo-btn-accent font-display rounded-2xl px-7 py-3.5 text-[0.95rem] font-semibold"
        >
          Open ABRO
        </Link>
      </section>

      <footer
        className="flex flex-col items-center gap-1 pb-4 text-center text-[0.78rem]"
        style={dim}
      >
        <p>
          <span className="font-display font-bold" style={gradientText}>
            ABRO
          </span>{' '}
          · Remember every expense. Forget the confusion.
        </p>
        <p>Made in Ethiopia · Currently in testing with friends and family</p>
      </footer>
    </main>
  );
}
