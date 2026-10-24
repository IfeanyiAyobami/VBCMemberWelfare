# VBC v3.7 validation

Validation uses fictional local fixtures and the actual production build. No hosted Supabase writes, historical import, Netlify deployment or outbound messages were performed.

## Completed checks

| Area | Result |
| --- | --- |
| Next.js production webpack build | Passed; `/followups` renders JourneyDesk and `/api/journey` is included. |
| Next route generation + TypeScript | Passed (`npm run typecheck`). |
| Journey SQL/RLS | 37 checks passed, including the complete core/Home Cell migration chain through 017 and a second application of 017. |
| Membership calendar | Lagos date boundaries, same-day last Sunday, next-month and year rollover passed. |
| Staff guest defaults | ON defaults, optional email and preservation of explicit opt-outs passed. |
| Home Cell SQL/workflows | Existing 93 checks passed. |
| Gateway contract validation | 56 checks passed. |
| Gateway SQL/RLS | 21 checks passed against migration 008, including missing/present email, immutable receipts, defaults, retries and authorization. |
| Gateway HTTP | 27 checks passed with local Supabase fixtures. |
| Guest SQL | 28 checks passed. |
| Core care SQL | 26 checks passed. |
| Member validation | 33 checks passed. |
| Leadership account validation | 11 checks passed. |
| Home Cell onboarding/CSV validation | 15 checks passed. |
| Reliability | Origin validation, bounded reads, no automatic write replay, streaming JSON limits, atomic rate controls and service-only permissions passed. |
| Existing Member Care browser checks | 28 checks completed, including profile editing, preferences, archive/restore, mobile and read-only role controls. |
| Guest HTTP + browser | 25 HTTP and 23 browser checks passed, including guest review, duplicate linking, explicit SMS opt-out retention and immutable retry after a lost acknowledgement. |
| Journey browser + real API route | Desktop 1440px, tablet 834px and mobile 390px in both themes; no horizontal page overflow/runtime errors; retained form after an error/theme change; safe retry after a committed write with lost acknowledgement; explicit joining; retained original guest source; pending CFC policy; private caching, origin and payload checks passed. |
| Home Cell browser | 11 sections at 1440/768/390px plus role presentation, onboarding/transfers, password recovery, Gmail/phone account behavior and error popups passed. |
| Requested reassignment dialog | Readable in all four main-app/Home-Cell theme combinations, at desktop and mobile sizes; save action remains within the viewport. Visually inspected local screenshots. |
| Branding | VBC crest, bundled fonts and existing Home Cell photos compared byte-for-byte with the delivered v3.6 ZIP. |

## What the journey SQL checks establish

One central person ID and retained guest link; explicit official membership with a separate actual date; exactly two qualifying church services; self-report provenance; Home Cell exclusion; duplicate prevention; version conflicts; replay protection; role and assignee isolation; immediate former-friend access removal; no self-promotion; no-contact preference history/task pausing; month-end six-calendar-month care; Foundation-only class actions; policy gates; evidenced attendance corrections and membership review flags; manual certificate recording without closing continuing care; scoped pagination totals; and compatibility with Home Cell onboarding/explicit opt-outs.

## Limits

Local HTTP/browser fixtures verify application behavior; SQL/RLS fixtures verify database rules. PGlite uses one local connection and does not establish multi-session production load characteristics. Existing core schema fixtures stand in for your installed initial schema. The full migration chain, including Home Cell, was additionally applied in the journey suite.

Church service types, CFC assessment/make-up/certificate policy and care sign-off rules remain approval inputs. The application deliberately does not invent them. Historical matching/import, real-provider delivery and production deployment require the separate steps described in the setup guide. Existing standalone legacy preview modules are outside this release's operational validation scope.
