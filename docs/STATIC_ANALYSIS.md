# Static analysis / l10n (first App Store cut)

- **Psalm:** root `psalm.xml` targets `lib/` at `errorLevel="8"` (informational). `vimeo/psalm` is listed in `composer.json` `require-dev` but not required for CI yet — run locally after `composer install`. A follow-up pass can tighten to errorLevel 3–5 with an OCP stub + baseline that fails on new issues only.
- **Frontend l10n:** `l10n/en.json` / `de.json` exist for Activity/Notifier strings. Full Vue l10n (~700 strings) is deferred for a later cut.
