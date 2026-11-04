// The playground page and Northstar wireframe styles, shared by /raven-design and
// /motion. Kept as one verbatim string so /raven-design renders exactly as before.
export const PLAYGROUND_CSS = `
        .playground-page {
          min-height: 100vh;
          padding-bottom: var(--space-24);
        }

        .playground-intro {
          padding: calc(var(--nav-height) + var(--space-20)) 0 var(--space-12);
          text-align: center;
        }

        .playground-intro .label {
          margin-bottom: var(--space-3);
        }

        .playground-intro h1 {
          color: var(--text-primary);
          font-size: clamp(42px, 6vw, 72px);
          line-height: var(--leading-heading);
          letter-spacing: -0.045em;
        }

        .playground-intro p:last-child {
          max-width: 640px;
          margin: var(--space-5) auto 0;
          color: var(--text-secondary);
        }

        .playground-stage {
          padding: var(--space-10) 0 var(--space-20);
        }

        .playground-stage-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--space-6);
          max-width: var(--max-width);
          margin: 0 auto var(--space-6);
        }

        .playground-stage-heading p:last-child {
          color: var(--text-tertiary);
          font-size: 14px;
        }

        .playground-wireframe {
          --demo-colors-accent: #00BFFF;
          --demo-colors-primary: #F0F0F2;
          --demo-colors-surface: #212129;
          --demo-colors-surface-raised: #2A2A33;
          --demo-colors-muted: #9498A0;
          --demo-colors-line: rgba(240, 240, 242, 0.12);
          --demo-rounded-sm: 6px;
          --demo-rounded-md: 12px;
          --demo-rounded-lg: 20px;
          --demo-spacing-xs: 4px;
          --demo-spacing-sm: 8px;
          --demo-spacing-md: 16px;
          --demo-spacing-lg: 24px;
          --demo-spacing-xl: 40px;
          --demo-text-family: Arial, sans-serif;
          --demo-text-display-size: 30px;
          --demo-text-display-line-height: 1.1;
          --demo-text-display-weight: 600;
          --demo-text-title-size: 18px;
          --demo-text-title-line-height: 1.3;
          --demo-text-title-weight: 600;
          --demo-text-body-size: 14px;
          --demo-text-body-line-height: 1.6;
          --demo-text-body-weight: 400;
          --demo-text-caption-size: 12px;
          --demo-text-caption-line-height: 1.4;
          --demo-text-caption-weight: 400;

          width: 100%;
          margin: 0 auto;
          overflow: hidden;
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-lg);
          font-family: var(--demo-text-family);
        }

        .playground-wireframe a,
        .playground-wireframe button,
        .playground-wireframe input,
        .playground-wireframe textarea {
          font-family: var(--demo-text-family);
        }

        .wireframe-nav {
          display: flex;
          align-items: center;
          gap: var(--demo-spacing-lg);
          padding: var(--demo-spacing-md) var(--demo-spacing-lg);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-logo {
          display: inline-flex;
          align-items: center;
          gap: var(--demo-spacing-sm);
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          margin-right: auto;
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-title-size);
          line-height: var(--demo-text-title-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-logo span {
          width: var(--demo-spacing-lg);
          height: var(--demo-spacing-lg);
          background: var(--demo-colors-primary);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-nav__links,
        .wireframe-footer__links {
          display: flex;
          align-items: center;
          gap: var(--demo-spacing-lg);
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
        }

        .wireframe-nav__links a:hover,
        .wireframe-footer__links a:hover {
          color: var(--demo-colors-primary);
        }

        .wireframe-nav__links a,
        .wireframe-footer__links a {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-width: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
        }

        .wireframe-hero {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, 0.9fr);
          align-items: center;
          gap: var(--demo-spacing-xl);
          padding: calc(var(--demo-spacing-xl) * 1.5) var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-hero__copy {
          display: grid;
          gap: var(--demo-spacing-md);
        }

        .wireframe-caption {
          color: var(--demo-colors-accent);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
          text-transform: uppercase;
        }

        .wireframe-hero h2 {
          max-width: 540px;
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-display-size);
          line-height: var(--demo-text-display-line-height);
          font-weight: var(--demo-text-display-weight);
        }

        .wireframe-body {
          max-width: 520px;
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
        }

        .wireframe-actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--demo-spacing-sm);
          margin-top: var(--demo-spacing-sm);
        }

        .wireframe-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          padding: var(--demo-spacing-sm) var(--demo-spacing-md);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-title-weight);
          cursor: pointer;
        }

        .wireframe-button--primary {
          color: var(--demo-colors-surface);
          background: var(--demo-colors-accent);
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button:hover {
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button--primary:hover {
          color: var(--demo-colors-surface);
          background: var(--demo-colors-primary);
          border-color: var(--demo-colors-primary);
        }

        .wireframe-button--secondary {
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface-raised);
        }

        .wireframe-button--secondary:hover {
          color: var(--demo-colors-accent);
          border-color: var(--demo-colors-accent);
        }

        .wireframe-button:active {
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface-raised);
        }

        .wireframe-button:disabled {
          color: var(--demo-colors-muted);
          background: var(--demo-colors-surface);
          border-color: var(--demo-colors-line);
          cursor: not-allowed;
          opacity: 0.6;
        }

        .wireframe-button:focus-visible,
        .playground-wireframe a:focus-visible,
        .wireframe-field input:focus-visible,
        .wireframe-field textarea:focus-visible {
          outline: 2px solid var(--demo-colors-accent);
          outline-offset: var(--demo-spacing-xs);
        }

        .wireframe-field input:focus {
          border-color: var(--demo-colors-accent);
          outline: 2px solid var(--demo-colors-accent);
          outline-offset: var(--demo-spacing-xs);
        }

        .wireframe-placeholder {
          display: grid;
          gap: var(--demo-spacing-md);
          min-height: 260px;
          padding: var(--demo-spacing-md);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-placeholder__bar {
          width: 42%;
          height: var(--demo-spacing-sm);
          background: var(--demo-colors-muted);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-placeholder__grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: var(--demo-spacing-sm);
        }

        .wireframe-placeholder__grid span {
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-features {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: var(--demo-spacing-md);
          padding: var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-feature-card {
          display: grid;
          align-content: start;
          gap: var(--demo-spacing-md);
          padding: var(--demo-spacing-lg);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-icon {
          width: var(--demo-spacing-xl);
          height: var(--demo-spacing-xl);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
        }

        .wireframe-feature-card h3,
        .wireframe-form-section h3 {
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-title-size);
          line-height: var(--demo-text-title-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-feature-card p,
        .wireframe-form-section__intro > p:last-child {
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
        }

        .wireframe-form-section {
          display: grid;
          grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr);
          gap: var(--demo-spacing-xl);
          padding: var(--demo-spacing-xl);
          border-bottom: 1px solid var(--demo-colors-line);
        }

        .wireframe-form-section__intro,
        .wireframe-form {
          display: grid;
          align-content: start;
          gap: var(--demo-spacing-md);
        }

        .wireframe-form {
          padding: var(--demo-spacing-lg);
          background: var(--demo-colors-surface-raised);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-md);
        }

        .wireframe-field {
          display: grid;
          gap: var(--demo-spacing-sm);
        }

        .wireframe-field label {
          display: flex;
          align-items: center;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          color: var(--demo-colors-primary);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-title-weight);
        }

        .wireframe-field input,
        .wireframe-field textarea {
          width: 100%;
          min-height: calc(var(--demo-spacing-xl) + var(--demo-spacing-xs));
          padding: var(--demo-spacing-sm) var(--demo-spacing-md);
          color: var(--demo-colors-primary);
          background: var(--demo-colors-surface);
          border: 1px solid var(--demo-colors-line);
          border-radius: var(--demo-rounded-sm);
          font-size: var(--demo-text-body-size);
          line-height: var(--demo-text-body-line-height);
          font-weight: var(--demo-text-body-weight);
          resize: vertical;
        }

        .wireframe-field input::placeholder,
        .wireframe-field textarea::placeholder {
          color: var(--demo-colors-muted);
          opacity: 1;
        }

        .wireframe-form .wireframe-button {
          justify-self: start;
          margin-top: var(--demo-spacing-sm);
        }

        .wireframe-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--demo-spacing-lg);
          padding: var(--demo-spacing-lg) var(--demo-spacing-xl);
          color: var(--demo-colors-muted);
          font-size: var(--demo-text-caption-size);
          line-height: var(--demo-text-caption-line-height);
          font-weight: var(--demo-text-caption-weight);
        }

        .playground-controls {
          display: flex;
          align-items: center;
          gap: var(--space-4);
          margin-bottom: var(--space-4);
        }

        /* Two Grab panels frame the page from 761px up. The site nav sits in the gap
           between them, 12px clear of each: the panels reach 310px in from each edge
           up to 1024px, 332px up to 1280px, and 380px above that. When the gap is too
           narrow for the links, the nav moves them into its menu (assets/nav.js). */
        @media (min-width: 761px) {
          raven-nav {
            --max-width: calc(100vw - 644px);
          }
        }

        @media (min-width: 1025px) {
          raven-nav {
            --max-width: calc(100vw - 688px);
          }
        }

        @media (min-width: 1281px) {
          raven-nav {
            --max-width: min(1140px, calc(100vw - 784px));
          }
        }

        @media (min-width: 1440px) {

          /* Center the role toggle at the bottom of the page, matching the grab
             panels' 20px margin from the bottom of the viewport. The pill wraps
             only the toggle so it lands on the true viewport centre; the replay
             link floats to its right rather than shifting the toggle off-centre. */
          .playground-controls {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            z-index: 100;
            margin-bottom: 0;
          }

          .playground-replay {
            position: absolute;
            left: calc(100% + var(--space-4));
            top: 50%;
            transform: translateY(-50%);
            white-space: nowrap;
          }
        }

        .playground-role-toggle {
          display: inline-flex;
          padding: var(--space-1);
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-sm);
        }

        .playground-role-toggle button {
          min-height: 44px;
          padding: 0 var(--space-4);
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }

        .playground-role-toggle button:hover {
          color: var(--text-primary);
        }

        .playground-role-toggle button[aria-pressed="true"] {
          color: var(--text-primary);
          background: var(--bg-raised);
        }

        .playground-replay {
          min-height: 44px;
          padding: 0;
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          cursor: pointer;
          font-size: 13px;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .playground-replay:hover {
          color: var(--accent-blue);
        }

        /* The tour is portalled to the end of <html>, outside <body>, so it takes the
           body's type itself rather than the browser's default serif. */
        .playground-tour {
          font-family: var(--font-body);
          font-size: clamp(17px, 1.6vw, 21px);
          line-height: var(--leading-copy);
          color: var(--text-secondary);
        }

        .playground-tour__backdrop {
          position: fixed;
          inset: 0;
          z-index: 2147483640;
          background: rgba(10, 10, 18, 0.55);
        }

        .playground-tour__spotlight {
          position: fixed;
          z-index: 2147483641;
          border: 2px solid var(--accent-blue);
          border-radius: var(--radius-sm);
          box-shadow: 0 0 0 9999px rgba(10, 10, 18, 0.55);
          pointer-events: none;
        }

        .playground-tour__card {
          z-index: 2147483647; /* equal to Grab's host; the tour portal comes after it in <html> */
          padding: var(--space-6);
          color: var(--text-primary);
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          border-radius: var(--radius-md);
          box-shadow: 0 24px 48px -12px rgba(0, 0, 0, 0.5);
          display: flex;
          flex-direction: column;
        }

        /* On short screens the card gets a max height; only the text scrolls, so the
           buttons stay in view and the tail outside the card is not clipped. */
        .playground-tour__body {
          min-height: 0;
          overflow-y: auto;
        }

        @media (max-height: 480px) {
          .playground-tour__card { padding: var(--space-4); }
          .playground-tour__actions { margin-top: var(--space-2); }
        }

        /* The tail is a rotated square sharing the card's fill and border, with the
           two edges facing the card masked by a matching-coloured overlay — a border
           on a CSS triangle isn't possible, and a real notch keeps the 1px outline
           continuous around the whole shape. */
        .playground-tour__card[data-tail]::after {
          content: '';
          position: absolute;
          left: var(--tail-left, 50%);
          width: 12px;
          height: 12px;
          margin-left: -6px;
          background: var(--bg-surface);
          border: 1px solid var(--border-strong);
          transform: rotate(45deg);
        }

        .playground-tour__card[data-tail='bottom']::after {
          bottom: -7px;
          clip-path: polygon(100% 0, 100% 100%, 0 100%);
        }

        .playground-tour__card[data-tail='top']::after {
          top: -7px;
          clip-path: polygon(0 0, 100% 0, 0 100%);
        }

        /* Sideways tails for the panel steps — the card sits beside a panel and
           points horizontally at it, so the tail lives on the card's left/right
           edge, vertically centred, instead of top/bottom. */
        .playground-tour__card[data-tail='right']::after {
          left: auto;
          right: -7px;
          top: 50%;
          margin-left: 0;
          margin-top: -6px;
          clip-path: polygon(0 0, 100% 0, 100% 100%);
        }

        .playground-tour__card[data-tail='left']::after {
          left: -7px;
          top: 50%;
          margin-left: 0;
          margin-top: -6px;
          clip-path: polygon(0 0, 0 100%, 100% 100%);
        }

        .playground-tour__card h3 {
          margin: 0 0 var(--space-2);
          font-size: 16px;
          font-weight: 600;
        }

        .playground-tour__body > p:not(.playground-tour__count) {
          margin: 0;
          color: var(--text-secondary);
          font-size: 14px;
          line-height: 1.6;
        }

        .playground-tour__count {
          margin: 0 0 var(--space-2);
          color: var(--text-secondary);
          font-size: 13px;
        }

        .playground-tour__actions {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-top: var(--space-4);
        }

        .playground-tour__actions button {
          min-height: 44px;
          padding: 0 var(--space-4);
          color: var(--text-secondary);
          background: transparent;
          border: 0;
          border-radius: var(--radius-sm);
          cursor: pointer;
          font-size: 13px;
          font-weight: 600;
        }

        .playground-tour__actions button:hover {
          color: var(--text-primary);
        }

        .playground-tour__next {
          color: var(--text-on-accent) !important;
          background: var(--accent-blue) !important;
        }

        .playground-tour__next:hover {
          filter: brightness(1.1);
        }

        @media (max-width: 640px) {
          .playground-tour__card {
            right: 16px !important;
            left: 16px !important;
            width: auto !important;
          }

          .playground-intro {
            padding-top: calc(var(--nav-height) + var(--space-12));
          }

          .playground-stage-heading {
            display: block;
          }

          .playground-stage-heading p:last-child {
            margin-top: var(--space-2);
          }

          .wireframe-nav {
            flex-wrap: wrap;
            gap: var(--demo-spacing-md);
            padding: var(--demo-spacing-md);
          }

          .wireframe-nav__links {
            order: 3;
            width: 100%;
            justify-content: space-between;
            padding-top: var(--demo-spacing-sm);
            border-top: 1px solid var(--demo-colors-line);
          }

          .wireframe-hero,
          .wireframe-form-section {
            grid-template-columns: 1fr;
            gap: var(--demo-spacing-lg);
            padding: var(--demo-spacing-lg);
          }

          .wireframe-placeholder {
            min-height: 220px;
          }

          .wireframe-features {
            grid-template-columns: 1fr;
            padding: var(--demo-spacing-lg);
          }

          .wireframe-footer {
            align-items: flex-start;
            flex-direction: column;
            padding: var(--demo-spacing-lg);
          }
        }
      `
