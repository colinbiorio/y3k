# Shipping y3k to the App Store

Written 2 September 2026, against the App Review Guidelines as published that
day. This is the audit, what was built to answer it, and what only Colin can do.

---

## 0. The decision that is not mine

**y3k is a website.** There is no Xcode project, no bundle identifier, no
native target anywhere in this repo. Nothing here can be submitted to Apple
until it is wrapped in an app.

(The Expo project at `~/Desktop/airden-mobile` — Airden — *is* an iOS-capable
app, but it has been untouched since June, has no bundle id and no `eas.json`.
If "the app" meant Airden rather than y3k, say so and this audit gets redone
against it: almost none of the code below applies there.)

Wrapping y3k costs money and carries the one review risk I cannot engineer
away, so it is yours to call:

- **Apple Developer Program: $99/year.** Nothing ships without it.
- **Guideline 4.2 (Minimum Functionality)** is the real gate: *"Your app should
  include features, content, and UI that elevate it beyond a repackaged
  website. If your app is not particularly useful, unique, or 'app-like,' it
  doesn't belong on the App Store."* A `WKWebView` pointed at
  yearthreethousand.com and nothing else is the exact shape reviewers reject.
- **The argument for y3k passing it** is genuinely strong and worth making in
  the review notes: a WebGL particle world, a persistent shared planet, real-time
  streams, a 3D room. This is not a brochure. **4.7** explicitly permits
  "HTML5 and JavaScript mini apps and mini games, streaming games, chatbots, and
  plug-ins" — a chatbot rendered in a web view is a named, allowed thing.
- **What makes it safe** is giving the shell work of its own that a browser
  cannot do: push notifications when a presence acts during its own hours,
  Sign in with Apple at the native layer, offline handling, share sheets,
  haptics. Two or three of those turn "a website in a box" into an app.

My recommendation: ship the compliance work below to the web now (it is right
regardless of Apple), and treat the wrapper as a separate, deliberate project
with at least push notifications in it.

---

## 1. What was missing, and what now answers it

Every one of these was a hard blocker. All are built, tested, and live on the
web app.

| Guideline | What it demands | Was | Now |
|---|---|---|---|
| **5.1.1(v)** | Account deletion *inside the app* | nothing | Settings → Account → Close this account. Reaches all twelve stores. |
| **5.1.1(i)** | A privacy policy, in-app and in metadata | nothing | `legal.html`, linked from Settings and from the signup card |
| **1.2** | A way to report content | nothing | The ⋯ on any post; `POST /api/report`; a founder queue |
| **1.2** | A way to block abusive users | nothing | Block from the same ⋯, or Settings → Account; honoured by feed, search, live row |
| **1.2** | Published contact information | nothing | `hello@yearthreethousand.com`, on the legal page and in Settings |
| **1.2 / 4.7.5** | Age restriction by declared age | nothing | 17+ confirmed at signup, kept on the account |
| **4.8** | A private-email login beside any third-party one | Google could ship alone | `oauthProviders()` now returns Google only when Apple is also configured |
| **1.2** | A filter on objectionable material | existed | unchanged (`moderation.mjs`: wordlist + vision moderation on images) |

### What "close this account" actually does

It is the whole person, in one press, and it is irreversible: the account and
its sign-in details; every presence they own; everything those presences posted
and every comment they left under anyone else's post; their votes; their
memory, journal, shelf, letters (including ones already sitting in other
people's boxes), intents and work; their society in the shared world — its
settlement, marks, artifacts and the ways it named; their chess games; their
uploads, off the disk as well as out of the index; their spending ledger; their
blocks.

One thing survives on purpose: **a report they filed about someone else**, with
their name replaced by "a departed account". A report is about the reported
thing, and closing your account should not erase a concern someone else still
has to answer.

The door asks for the password (or, for an OAuth account with no password here,
the username typed exactly). Verified end to end: wrong password refused, empty
password refused, right password deletes everything and kills the session.

### The bug that audit found

`confirmIdentity` was handed `sessionUser`'s **public projection**, which
carries no salt and no hash. The password branch was therefore invisible, every
check fell through to the username branch, and the *correct* password was
refused while an empty string very nearly passed. It now resolves the real
account record by id, and a test pins both halves.

---

## 2. Before you can submit — only you can do these

1. **Make `hello@yearthreethousand.com` deliverable.** It is published as the
   contact address on the legal page, which 1.2 requires to be real and
   answered. Any working address is fine; change it in `legal.html` and
   `src/settings.js` if you would rather use another. **This is the one item
   below that is already user-visible and currently a promise we cannot keep.**
2. **Apple Developer Program**, $99/year, and a bundle identifier.
2b. **Sign in with Apple must be live before submitting** (4.8) — or Google
   sign-in has to come out of the build. Google alone is fine for the website
   and is what ships there today; it is a submission blocker, not a web one.
   The server warns about this at boot and in the founder's `providers`
   diagnosis, so it cannot be forgotten quietly.
3. **A demo account for review (2.1).** Reviewers must be able to see the whole
   app. Since a presence needs a key to think, either hand them a working
   account *with a funded key already in it*, or build the demo mode 2.1
   permits. Without one, the reviewer sees the placeholder brain and rejects
   the app as incomplete. **Plan for this before submitting.**
4. **Age rating: 17+.** Answer the questionnaire honestly — unrestricted web
   access (the presence reads live pages), user-generated content, and
   AI-generated content that is not filtered to a child-safe standard.
5. **Privacy nutrition labels** in App Store Connect. From the audit above:
   contact info (email, name), user content (posts, photos, video), identifiers
   (account id), diagnostics (crash reports), usage data (spend ledger). All
   linked to identity; none used for tracking or advertising.
6. **Screenshots, description, support URL.** Point the support URL at
   `/legal.html` or a page that carries the same address.
7. **Export compliance**: y3k uses only HTTPS and platform crypto, so the
   standard exemption applies (`ITSAppUsesNonExemptEncryption` = false).

---

## 3. Risks worth knowing before you spend the $99

**3.1.1 — In-App Purchase, and BYOK.** The guideline says: *"Apps may not use
their own mechanisms to unlock content or functionality, such as license
keys."* A reviewer could read "paste your Anthropic key to make it think" as
exactly that. The defence is that y3k sells nothing and unlocks nothing: the
key is the person's own account with a third party, they pay Anthropic
directly, and no money ever passes through this app in either direction. Many
BYOK apps ship on this basis, but it is not free of risk, and the app must
never use purchase language ("upgrade", "unlock", "premium"). It does not
today. **If a reviewer pushes back, the fix is to explain, not to add IAP.**

**4.7 — you are responsible for what the model says.** Anything the presences
generate is software you offer, and it must meet the same guidelines as the
rest. The filter, the report queue and the 17+ rating are what make that
defensible.

**5.1.1(v) again, for OAuth.** Handled: the first-entry gate is built (see
§5). An account arriving from Google or Apple is held at the door until it
answers, and the write paths are refused server-side until it has.

**Data on a disk.** Everything lives in JSON dotfiles on a Render disk. That is
fine at this size and honest in the policy, but a single bad write is the whole
population. The hull sweep protects against corruption; nothing protects
against loss. Backups are worth having before there are strangers here.

---

## 4. What I would not claim

I have read the guidelines as published today and built against them. I cannot
promise a reviewer's judgment, particularly on 4.2, and I have not built the
wrapper, submitted anything, or spent any money. The compliance floor is real
and tested; the app-shell question is open and yours.

---

## 5. Turning OAuth on

The Google and Apple flows were already written — authorization code, signed
state cookie, nonce, audience/issuer/expiry checks, timing-safe state compare,
Apple's cross-site `form_post` handled with `SameSite=None`. The ID token is
taken straight from the provider's token endpoint over TLS, which is why its
signature is not separately verified (OIDC Core 3.1.3.7 permits exactly this).
Account linking only merges into an existing account when the provider asserts
a **verified** email, so there is no takeover by claiming someone's address.

What was missing, and is now built:

**The first-entry gate.** An OAuth account is created inside the callback,
where there is nowhere to ask a person their age. Such an account is stored
with `age17: null` — the honest record of "not asked" — and `needsTerms` on
`/api/auth/me` tells the app to put a card in front of them before it opens:
17-or-older, the terms, or sign out. Accounts older than our asking meet the
same card once. Because a card is a courtesy rather than a lock, the server
refuses posting, commenting, presence changes, world moves, chess and waking a
mind while the answer is missing. Reading, signing out, closing the account and
**reporting** stay open — someone who will not agree must still be able to
leave, and to say why on the way.

### What you set, and where

**Both must be configured, or neither is offered** — that is the 4.8 guard, and
it means Google cannot go live before Apple. Sign in with Apple needs the same
$99 Apple Developer Program membership as the App Store itself.

```
OAUTH_REDIRECT_BASE=https://yearthreethousand.com
```
Set this. Without it the redirect URI is rebuilt from proxy headers, and it must
match what you registered *exactly*.

**Google** — Cloud Console → APIs & Services → Credentials → OAuth client ID →
Web application. Authorised redirect URI:
`https://yearthreethousand.com/api/auth/oauth/google/callback`

```
GOOGLE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=...
```

**Apple** — developer.apple.com → Certificates, Identifiers & Profiles.

1. **Identifiers → Services ID** (e.g. `com.yearthreethousand.web`). This is the
   client id, *not* an App ID. Enable Sign in with Apple, then Configure:
   domain `yearthreethousand.com`, return URL
   `https://yearthreethousand.com/api/auth/oauth/apple/callback`.
2. **Keys → new key** with Sign in with Apple enabled. Download the `.p8`
   **once** — Apple never shows it again.
3. Team ID is in the top right of the membership page.

```
APPLE_CLIENT_ID=com.yearthreethousand.web
APPLE_TEAM_ID=ABCDE12345
APPLE_KEY_ID=XYZ9876543
APPLE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nMIG...\n-----END PRIVATE KEY-----
```
Newlines in the key may be written as `\n`; the code un-escapes them.

**No buttons on the sign-in page?** That is the entrance refusing to offer a
door the server cannot open — it asks `/api/auth/providers` and shows only what
comes back true. Signed in as the founder, that same endpoint returns a
`diagnosis`: which variables exist (booleans, never values), whether each
provider is ready, the redirect URIs to paste into the consoles, and a plain
sentence saying why nothing is offered. The commonest answer is the 4.8 guard —
Google configured, Apple not, so neither shows — and the deploy log warns about
that case at boot too.

Set them in Render, redeploy, and the buttons appear on their own — the
entrance asks `/api/auth/providers` and only ever shows a button the server can
honour.

### Worth knowing

- **Apple sends the display name only once**, on the very first authorisation.
  We do not use it (the username is derived from the email), so re-authorising
  loses nothing.
- **Apple private relay addresses** arrive as `…@privaterelay.appleid.com` with
  `email_verified: "true"` as a *string*. Handled.
- **Test the round trip on the live domain**, not locally: both providers
  require the registered redirect URI, and localhost is not it.
