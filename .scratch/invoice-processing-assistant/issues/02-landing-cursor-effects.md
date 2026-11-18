# 02 — Landing page ("Journey")

Status: resolved
Blocked by: 01

## What
A dark-only landing page `/` that tells the product's story by following one sample Invoice from upload to export. See spec "Landing page (\"Journey\")".

This replaces the earlier plan of six switchable cursor effects (Lens, Receipt, Stamp, Particles, Ruler, Scanner). Four full designs were prototyped (Journey, Bento, Terminal, Paper), and Journey was chosen.

## Scope
- Sticky navbar: logo, anchor links *How it works* (`#journey`), *Features* (`#how`), *FAQ* (`#faq`), and Sign in / Get started. Sections carry `scroll-mt-14` so the header does not cover them.
- Hero: headline and lead from `app/lib/landing/content.ts`, CTAs, and a tilted sample Invoice with floating Field tags.
- Journey: a pinned, scroll-scrubbed stage with five chapters (Add, Extract, Check, Review, Export) and a clickable chapter rail. The model misreads the total as 1,204.00, the Check flags it, and Review corrects it to 1,240.00.
- How it works: three steps joined by a drawn SVG path.
- FAQ accordion, closing CTA with a magnetic button, footer.
- No "Bring your own LLM" / provider orbit section.
- Motion uses GSAP through `useLandingMotion`, scoped to the page root and reverted on unmount. Use the Ledger Noir palette.

## Acceptance
- `/` renders the Journey page with no version switcher.
- Each navbar link scrolls to its section, below the sticky header.
- With `prefers-reduced-motion`, nothing is pinned or scrubbed and every section shows its end state.
- Leaving the page leaves no ScrollTriggers, tweens or listeners behind.
