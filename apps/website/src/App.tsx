import { useEffect, useRef, useState } from 'react';

type IconName = 'arrow' | 'check' | 'shield' | 'pin' | 'spark' | 'people' | 'menu' | 'close';

function Icon({ name, className = '' }: { name: IconName; className?: string }) {
  const paths: Record<IconName, React.ReactNode> = {
    arrow: (
      <>
        <path d="M4 12h15M13 5l7 7-7 7" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    shield: (
      <>
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    pin: (
      <>
        <path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 0 1 14 0Z" />
        <circle cx="12" cy="10" r="2" />
      </>
    ),
    spark: (
      <>
        <path d="M12 2v20M2 12h20M5 5l14 14M5 19 14-14" />
      </>
    ),
    people: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 4v2" />
      </>
    ),
    menu: <path d="M4 7h16M4 12h16M4 17h16" />,
    close: <path d="m6 6 12 12M6 18 12-12" />,
  };
  return (
    <svg
      className={`icon ${className}`}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}

function Wordmark() {
  return (
    <a className="wordmark" href="#home" aria-label="HireQuick home">
      <img className="brand-mark" src="/hirequick-mark.svg" width="114" height="100" alt="" />
      <span>HireQuick</span>
    </a>
  );
}

const occasions = [
  {
    name: 'Weddings',
    detail: 'From the first welcome to the last dance.',
    description:
      'Find ushers to welcome your guests, guide them to their seats, and keep your celebration flowing. You stay in the moment.',
    tag: 'A little less planning. A lot more celebrating.',
    number: '01',
  },
  {
    name: 'Corporate events',
    detail: 'A great first impression, on every occasion.',
    description:
      'Bring together a team for guest registration, check-in, and wayfinding. Keep your conference, launch, or company gathering running smoothly.',
    tag: 'Professional people. Thoughtful details.',
    number: '02',
  },
  {
    name: 'Private celebrations',
    detail: 'Your favourite people. A proper welcome.',
    description:
      'Birthdays, anniversaries, and those just-because gatherings. Find welcoming event staff so you can spend more time with your guests.',
    tag: 'Be the host. Enjoy the party.',
    number: '03',
  },
  {
    name: 'Brand experiences',
    detail: 'Put a human face to your big idea.',
    description:
      'Connect with promotional staff and brand ambassadors who can welcome visitors and support your next activation.',
    tag: 'Make the introduction count.',
    number: '04',
  },
];

const questions = [
  {
    question: 'What is HireQuick?',
    answer:
      'HireQuick is a mobile-first marketplace connecting event organisers with ushers and event staff in Lagos. Find people, coordinate bookings, verify attendance, and manage payments in one place.',
  },
  {
    question: 'How do I find the right people for my event?',
    answer:
      'Post your event with the date, location, dress code, budget, and number of staff you need, then review applications. You can also browse profiles and invite specific people. A booking is confirmed after acceptance and payment.',
  },
  {
    question: 'How are payments protected?',
    answer:
      'Your booking payment is held in escrow. After verified or automatic completion, eligible funds are released to the usher’s wallet once 72 hours have passed after the event ends, provided there is no unresolved dispute. Wallet withdrawals to a bank account are a separate step.',
  },
  {
    question: 'What does HireQuick cost?',
    answer:
      'As an organiser, you pay the agreed staff pay plus a 15% platform fee. Each usher receives their full agreed pay. Your checkout shows staff pay, the platform fee and the total before you confirm.',
  },
  {
    question: 'What if my plans change?',
    answer:
      'Client cancellations more than 48 hours before the event receive a 100% refund. From 12 to 48 hours before the event, the refund is 50%. Less than 12 hours before the event, there is no refund. No-shows and disputes are handled through the booking support process.',
  },
  {
    question: 'Can I join as an usher?',
    answer:
      'Yes. HireQuick is being built for freelance ushers and event staff as well as organisers. You’ll be able to create a profile, complete verification, set your availability, and apply for events that work for you. See the getting-started section below for current availability.',
  },
];

function safeSignupUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [occasion, setOccasion] = useState(0);
  const [audience, setAudience] = useState<'client' | 'usher'>('client');
  const menuButton = useRef<HTMLButtonElement>(null);
  const signupUrl = safeSignupUrl(import.meta.env.VITE_SIGNUP_URL);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButton.current?.focus();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [menuOpen]);

  function startAs(role: 'client' | 'usher') {
    setAudience(role);
    setMenuOpen(false);
  }

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header id="home" className="site-header container">
        <Wordmark />
        <button
          ref={menuButton}
          className="menu-toggle"
          aria-label={menuOpen ? 'Close navigation' : 'Open navigation'}
          aria-expanded={menuOpen}
          aria-controls="main-navigation"
          onClick={() => setMenuOpen(!menuOpen)}
        >
          <Icon name={menuOpen ? 'close' : 'menu'} />
        </button>
        <nav
          id="main-navigation"
          className={menuOpen ? 'navigation is-open' : 'navigation'}
          aria-label="Main navigation"
        >
          <a href="#how-it-works" onClick={() => setMenuOpen(false)}>
            For organisers
          </a>
          <a href="#for-ushers" onClick={() => setMenuOpen(false)}>
            For event staff
          </a>
          <a href="#occasions" onClick={() => setMenuOpen(false)}>
            Our world <span aria-hidden="true">↗</span>
          </a>
          <a
            className="button button-small button-white"
            href="#get-started"
            onClick={() => startAs('client')}
          >
            Get started <Icon name="arrow" />
          </a>
        </nav>
      </header>
      <main id="main">
        <div className="opening">
          <section className="hero container" aria-labelledby="hero-heading">
            <div className="hero-copy">
              <p className="eyebrow">
                <span className="status-dot" /> EVENT STAFFING. SORTED.
              </p>
              <h1 id="hero-heading">
                BIG PLANS.
                <br />
                MEET YOUR
                <br />
                <span>PEOPLE.</span>
              </h1>
              <p className="hero-description">
                Find and book verified ushers and event staff in Lagos. The right people to help you
                pull it all off.
              </p>
              <div className="hero-actions">
                <a className="button" href="#get-started" onClick={() => startAs('client')}>
                  Hire event staff <Icon name="arrow" />
                </a>
                <a
                  className="button button-outline"
                  href="#get-started"
                  onClick={() => startAs('usher')}
                >
                  Find event work <Icon name="arrow" />
                </a>
              </div>
              <p className="hero-location">
                <Icon name="pin" /> Lagos, Nigeria <span>Big energy. Local people.</span>
              </p>
            </div>
            <div className="hero-visual">
              <div className="photo-backplate" aria-hidden="true" />
              <figure className="hero-photo">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/event-crew-640.webp 640w, /images/event-crew-960.webp 960w, /images/event-crew-1536.webp 1536w"
                    sizes="(max-width: 360px) 510px, (max-width: 640px) 593px, (max-width: 850px) 660px, (max-width: 1150px) 728px, (min-width: 1500px) 848px, 767px"
                  />
                  <img
                    src="/images/event-crew.jpg"
                    fetchPriority="high"
                    alt="An event host in black and white tailoring, with her team welcoming guests behind her"
                    width="1536"
                    height="1024"
                  />
                </picture>
                <figcaption>
                  <span>THE PEOPLE MAKE THE EVENT.</span>
                  <Icon name="arrow" />
                </figcaption>
              </figure>
              <div className="photo-tab" aria-hidden="true">
                READY FOR YOUR NEXT BIG THING.
              </div>
              <div className="hero-stamp" aria-hidden="true">
                <img src="/hirequick-mark.svg" width="114" height="100" alt="" />
              </div>
            </div>
          </section>
        </div>
        <div className="event-strip">
          <div className="container">
            <span>BUILT FOR THE OCCASION</span>
            <a href="#occasions" onClick={() => setOccasion(0)}>
              Weddings
            </a>
            <b aria-hidden="true">✳</b>
            <a href="#occasions" onClick={() => setOccasion(1)}>
              Corporate events
            </a>
            <b aria-hidden="true">✳</b>
            <a href="#occasions" onClick={() => setOccasion(2)}>
              Private parties
            </a>
            <b aria-hidden="true">✳</b>
            <a href="#occasions" onClick={() => setOccasion(3)}>
              Brand activations
            </a>
          </div>
        </div>
        <div className="page-content">
          <section
            id="how-it-works"
            className="section container how-section"
            aria-labelledby="how-heading"
          >
            <div className="section-intro">
              <p className="eyebrow">01 / FOR THE ONES WITH A PLAN</p>
              <h2 id="how-heading">
                LESS CHASING.
                <br />
                MORE MAKING
                <br />
                IT HAPPEN.
              </h2>
              <p>
                Great events take great people. Bring yours together without the endless calls, DMs,
                and spreadsheets.
              </p>
              <a className="text-link" href="#get-started" onClick={() => startAs('client')}>
                Build your event team <Icon name="arrow" />
              </a>
            </div>
            <div className="steps">
              <article className="step">
                <span className="step-number">01</span>
                <div>
                  <h3>Post the plan.</h3>
                  <p>
                    Set your date, location, budget, and how many people you need. Let the right
                    staff find you.
                  </p>
                </div>
                <Icon name="arrow" />
              </article>
              <article className="step">
                <span className="step-number">02</span>
                <div>
                  <h3>Pick your people.</h3>
                  <p>
                    Review applications or invite staff directly. Check their profiles, choose your
                    team, and confirm with payment.
                  </p>
                </div>
                <Icon name="arrow" />
              </article>
              <article className="step">
                <span className="step-number">03</span>
                <div>
                  <h3>Make it happen.</h3>
                  <p>
                    Coordinate in one place, confirm attendance on the day, and give your guests a
                    proper welcome.
                  </p>
                </div>
                <Icon name="arrow" />
              </article>
            </div>
          </section>

          <section id="occasions" className="occasion-section" aria-labelledby="occasion-heading">
            <div className="container occasion-layout">
              <figure className="occasion-photo">
                <picture>
                  <source
                    type="image/webp"
                    srcSet="/images/event-welcome-640.webp 640w, /images/event-welcome-960.webp 960w, /images/event-welcome-1536.webp 1536w"
                    sizes="(max-width: 640px) 615px, (max-width: 850px) 870px, 915px"
                  />
                  <img
                    src="/images/event-welcome.jpg"
                    alt="Event hosts welcoming guests and managing registration at an evening reception"
                    loading="lazy"
                    width="1536"
                    height="1024"
                  />
                </picture>
                <figcaption>
                  <span>
                    FRONT OF HOUSE.
                    <br />
                    AT THE HEART OF IT ALL.
                  </span>
                  <img src="/hirequick-mark.svg" width="114" height="100" alt="" />
                </figcaption>
              </figure>
              <div className="occasion-content">
                <p className="eyebrow">02 / YOUR OCCASION. YOUR CREW.</p>
                <h2 id="occasion-heading">
                  WHATEVER
                  <br />
                  YOU'RE PLANNING.
                </h2>
                <div className="occasion-list" aria-label="Explore event types">
                  {occasions.map((item, index) => (
                    <button
                      key={item.name}
                      className={
                        occasion === index ? 'occasion-button selected' : 'occasion-button'
                      }
                      aria-pressed={occasion === index}
                      aria-controls="occasion-detail"
                      onClick={() => setOccasion(index)}
                    >
                      <span className="occasion-index">{item.number}</span>
                      <span>{item.name}</span>
                      <Icon name="arrow" />
                    </button>
                  ))}
                </div>
                <div
                  id="occasion-detail"
                  className="occasion-detail"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  <h3>{occasions[occasion].detail}</h3>
                  <p>{occasions[occasion].description}</p>
                  <a className="text-link" href="#get-started" onClick={() => startAs('client')}>
                    Find your crew <Icon name="arrow" />
                  </a>
                </div>
              </div>
            </div>
          </section>

          <section className="trust-section" aria-labelledby="trust-heading">
            <div className="container">
              <div className="trust-heading">
                <p className="eyebrow">03 / CONFIDENCE COMES STANDARD</p>
                <h2 id="trust-heading">
                  GOOD PEOPLE.
                  <br />
                  <span>BACKED BY A BETTER PROCESS.</span>
                </h2>
              </div>
              <div className="assurances">
                <article>
                  <span className="assurance-label">THE PEOPLE</span>
                  <h3>Know your team.</h3>
                  <p>
                    Profiles, identity verification, and booking history help you choose the people
                    representing your event.
                  </p>
                </article>
                <article>
                  <span className="assurance-label">THE PAYMENT</span>
                  <h3>Held. Then released.</h3>
                  <p>
                    Your funds stay in escrow through completion and the 72-hour window after the
                    event. An unresolved dispute pauses release.
                  </p>
                </article>
                <article>
                  <span className="assurance-label">THE EVENT DAY</span>
                  <h3>Check in. Show up.</h3>
                  <p>
                    Confirm attendance on the day, keep your crew connected, and raise an issue
                    through your booking if needed.
                  </p>
                </article>
              </div>
              <a href="#faq" className="text-link">
                Get the full details <Icon name="arrow" />
              </a>
            </div>
          </section>

          <section id="for-ushers" className="worker-section" aria-labelledby="worker-heading">
            <div className="container worker-layout">
              <div>
                <p className="eyebrow">04 / FOR THE ONES WHO MAKE IT HAPPEN</p>
                <h2 id="worker-heading">
                  GOOD WITH PEOPLE?
                  <br />
                  MAKE IT
                  <br />
                  <span>YOUR THING.</span>
                </h2>
              </div>
              <div className="worker-copy">
                <p className="worker-lead">
                  New events. New connections.
                  <br />
                  Work that works for you.
                </p>
                <p>
                  Create your profile, set your availability, and find event work in Lagos. Build a
                  reputation that goes wherever you do.
                </p>
                <a
                  className="button button-dark"
                  href="#get-started"
                  onClick={() => startAs('usher')}
                >
                  Find your next opportunity <Icon name="arrow" />
                </a>
                <div className="worker-points">
                  <span>
                    <Icon name="check" /> Choose your availability
                  </span>
                  <span>
                    <Icon name="check" /> Know your expected earnings
                  </span>
                  <span>
                    <Icon name="check" /> Grow your booking history
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section id="faq" className="section container faq-section" aria-labelledby="faq-heading">
            <div>
              <p className="eyebrow">THE NEED-TO-KNOW</p>
              <h2 id="faq-heading">
                GOOD
                <br />
                QUESTIONS.
              </h2>
              <p className="faq-intro">Here’s how things work.</p>
            </div>
            <div className="faq-list">
              {questions.map(({ question, answer }) => (
                <details key={question}>
                  <summary>
                    {question}
                    <span className="faq-plus" aria-hidden="true" />
                  </summary>
                  <p>{answer}</p>
                </details>
              ))}
            </div>
          </section>

          <section id="get-started" className="get-started" aria-labelledby="start-heading">
            <div className="container start-layout">
              <div>
                <p className="eyebrow">
                  <span className="status-dot" /> STARTING IN LAGOS
                </p>
                <h2 id="start-heading">
                  LET'S GET
                  <br />
                  <span>TOGETHER.</span>
                </h2>
              </div>
              <div className="start-panel">
                <div className="audience-options" aria-label="Choose how to use HireQuick">
                  <button
                    aria-pressed={audience === 'client'}
                    onClick={() => setAudience('client')}
                  >
                    I’m hiring staff <Icon name="arrow" />
                  </button>
                  <button aria-pressed={audience === 'usher'} onClick={() => setAudience('usher')}>
                    I’m looking for work <Icon name="arrow" />
                  </button>
                </div>
                <div aria-live="polite">
                  <h3>
                    {audience === 'client'
                      ? 'Your next great team starts here.'
                      : 'Your next opportunity starts here.'}
                  </h3>
                  <p>
                    {signupUrl
                      ? audience === 'client'
                        ? 'Create your account and start bringing your next event team together.'
                        : 'Create your profile and get ready to find your next event.'
                      : audience === 'client'
                        ? 'We’re preparing to launch event staffing in Lagos. Public organiser signup is coming soon.'
                        : 'We’re preparing to welcome event staff in Lagos. Public staff signup is coming soon.'}
                  </p>
                </div>
                {signupUrl ? (
                  <a className="button" href={signupUrl}>
                    Get started with HireQuick <Icon name="arrow" />
                  </a>
                ) : (
                  <p className="launch-note">COMING SOON / LAGOS, NG</p>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
      <footer className="site-footer">
        <div className="container">
          <div className="footer-top">
            <Wordmark />
            <p>Big plans need good people.</p>
            <a href="#home" className="back-top">
              Back to top <span aria-hidden="true">↑</span>
            </a>
          </div>
          <div className="footer-bottom">
            <span>© {new Date().getFullYear()} HireQuick</span>
            <span>Made for the way Lagos shows up.</span>
            <a href="#faq">Questions & answers</a>
          </div>
          <div className="footer-word" aria-hidden="true">
            HIREQUICK<span>↗</span>
          </div>
        </div>
      </footer>
    </>
  );
}
