# 0004. Sign-in: Google and Microsoft, with an email code as fallback

- Status: Accepted
- Date: 2026-10-24
- Decider: maintainer
- Issue: #83
- Amends: [0001](0001-app-and-backend-stack.md) ("Supabase Auth with verification codes") and the pilot design (`docs/superpowers/specs/2026-10-24-pilot-design.md`, section 6.1, point 2)

## Context

ADR 0001 and the pilot design (section 6.1, point 2) say that people sign in with a verification code sent by phone or email. Every sign-in would then depend on a message arriving, and the provider for those messages is still open (ADR 0001 and 0002, Open).

Guardians, adult athletes, coaches and school administrators mostly already have a Google or Microsoft account on their phones and tablets. Supabase Auth, self-hosted on Dokploy (ADR 0002), supports both as OAuth providers, and its email code is already configured: GoTrue sends a 6-digit code (`GOTRUE_MAILER_OTP_LENGTH` unset, default 6) with the `otp.html` template described in `deploy/README.md`.

## Decision

- **Primary: Google and Microsoft**, through the OAuth providers of Supabase Auth on the self-hosted stack (ADR 0002).
- **Fallback: a 6-digit code sent by email**, for people who have neither account or prefer not to use it. It uses the GoTrue configuration that already exists.
- **No passwords.** The app never offers sign-up or sign-in with a password.
- These methods replace the pilot design's "phone or email verification by code".

Setting up the Google and Microsoft providers on the server and building the sign-in screens are separate tasks.

## Alternatives considered

- **Code only (the previous decision).** One method and no third-party accounts, but every sign-in waits for a message, and its cost and delivery depend on a provider that is still open.
- **Google and Microsoft only.** No messages to send, but it shuts out anyone without one of those accounts or who does not want to use it.
- **Google and the code, without Microsoft.** One provider fewer to configure, but people who use a Microsoft account (for example from work or school) would fall back to the code.

## Consequences

- When the iOS app ships, it must also offer Sign in with Apple: App Store Review Guideline 4.8 requires an equivalent privacy-focused login option in apps that offer a third-party login such as Google ([guideline 4.8](https://developer.apple.com/app-store/review/guidelines/#login-services)).
- OAuth gives a verified email and name for the adult, but it does not validate that the adult legally represents the minor. Representation validation (pilot design, section 6.1, point 5) stays open for counsel.
- The production email provider is still open, but only for the fallback code and invitations, not for every sign-in.
- Each OAuth provider needs an app registration (client ID and secret) kept as a server secret, and its redirect URLs must match the public Supabase domain.

## Open

- Production email provider for the fallback code and invitations, and its cost.
- Representation validation of the adult for a minor (counsel).
