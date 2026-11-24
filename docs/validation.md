# Validation record — November 24, 2026

## Executed locally

- Production build and TypeScript check: passed.
- 16 core tests: passed. Covers planning limits/citations/tool restrictions, immutable URL handling, target/SSRF policy, explicit approval and a mocked GitHub App token/blob flow.
- 10 browser/MCP tests: passed. Authentication and cross-origin checks; real sample verification and screenshot delivery; desktop/mobile axe and overflow checks; keyboard access; MCP initialize/list/generate/start/poll/report; draft-preserving navigation; a continuous editor focus boundary; confirmed deletion and cancellation.
- Real sample run: 6 pass, 2 fail, 2 not verified across desktop and mobile. This expected fixture mix is evidence that failures and unsupported checks are reported separately, not that a customer product passed.
- Desktop and 390px mobile interface captures inspected. The first accessibility pass found a mobile heading-order issue; corrected and rerun successfully. Authenticated screenshot serving initially failed because the storage folder is a dot directory; corrected with a tightly validated UUID and fixed filename route.
- After the user's design feedback: replaced the green template treatment with the current editorial workspace and checked desktop/mobile captures again. No automated axe violations in the exercised flow. User visual acceptance remains open.

## Not verified or not delivered

- No real GitHub installation credentials were supplied. GitHub signing/scoping/read behavior was tested with mocked API responses; live repository access and comment posting remain untested.
- No model key/model selection was supplied. Agent tool loop, citation checks and failure paths were tested with model fixtures; live model quality and cost remain untested.
- No real preview or eBarrel requests. DNS private-address denial was tested without sending an external request. Public preview transport has not had a live acceptance run.
- MCP HTTP was exercised with the official SDK client. Claude/Codex host onboarding, the stdio bridge in a desktop host, and hosted ChatGPT/OAuth are not verified.
- Browser support is Chromium only. This is not a full WCAG audit, screen-reader audit, general SPA test, transaction test or regression certification.
- No deployment, signed deployment webhook, automatic run, remote GitHub repository creation or push.

Reports/test artifacts are local and ignored by Git. Screenshots in docs are from the fictional sample flow only. No production orders, email messages, PR comments or source changes were made in eBarrel.

The workspace was subsequently refined to the user’s retained navigation layout. The editor now uses one continuous 2px focus boundary around the textarea and footer, without a detached blue outline. The past-review count contrast issue found by axe was corrected. Deletion was tested only on a newly created fictional sample review, including cancel, missing approval, unauthenticated denial, and unavailable report/evidence after removal.

## Phase 2 additions

- Interactive bundled sample: three scenarios across two viewports, six passes and six distinct screenshots. Real clicks, text entry and native selection exercised.
- Negative fixture: four passes, two failures for a missing outcome, two Not verified results for a prohibited action. Fresh context isolation verified.
- Submit buttons, password fields and ambiguous controls rejected in browser tests. Separate action approval required. Interactive editor checked at desktop and 390px with axe and overflow assertions.
- Unit coverage added for action budgets/approval, resource broker restrictions and network-disabled container command construction.
- Docker is unavailable locally. Container image build/launch and external interactive preview acceptance remain unverified and disabled by default. No production targets were used.

## Docker follow-up — November 24, 2026

Docker Desktop 4.100.1 is installed and running. The user-built asbuilt-browser:local image launched under the production worker restrictions. `node --import tsx scripts/verify-docker.ts` passed: six interaction passes, two intentional missing-text failures, two denied-broker Not verified results, ten valid PNG screenshots. Test containers were removed. Local interactive preview support is enabled; no preview origin was added and no real website was tested. External transport acceptance still requires an approved staging address. This supersedes the earlier Docker-unavailable limitation.

## Resource-loading repair — November 24, 2026

Build, 17 core tests and 10 browser tests passed. Added coverage for versioned assets, scoped transformed CDN images, and continued rejection of APIs, POST, scripts/documents on image hosts, sibling image directories and sensitive query parameters. Rebuilt Docker worker and reran the user-approved shopebarrel.tech homepage without actions or submissions. Both desktop and mobile now show styling and primary images (captures inspected), while both remain Not verified due to 28 and 14 blocked requests respectively. Report: cbd2a00e-9555-4d12-9726-e86178e90325. No eBarrel source changes or orders.

## Remember this device

Session tests cover restart persistence, expiry, logout revocation, access-key rotation, and hashed storage. Browser coverage checks the 30-day HttpOnly/SameSite cookie, reload persistence, sign-out denial of the old cookie, and a nonpersistent cookie when remembering is unchecked.

## Phase 4 MCP

19 core tests and 12 browser/protocol tests passed, including stdio launch from a different working directory and shared report retrieval across stdio/HTTP. Loopback URL validation rejects credentials, paths, fragments, query strings and remote hosts; fetch redirects are forbidden. Codex and Claude Desktop configuration entries installed without embedded credentials. Actual host tool activation still requires connection reload and verification. No hosted ChatGPT service deployed.
