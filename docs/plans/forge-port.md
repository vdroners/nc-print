# Forge → NC Print full port (2026-10-25)

**Status:** PLANNED (Sarge approved “All” — full port including Alfred cutover)
**Repo:** `vdroners/nc-print` · work tree `/media/4TB/nc-print`
**Parallel stack (do not delete yet):** `/media/4TB/3dprintforge` (Forge Studio `:3040` + forge-slicer `:8766`)
**Engine source of truth:** `/media/4TB/3dprintforge/slicer/3dprintforge-slicer/` (`ENGINE_SRC`)
**Shared parts library path:** `/media/4TB/3dprints`
**Browser verify URL:** `https://cloud-vdroners.ddns.net/apps/nc_print/`
**Reviewer / merge owner:** Sarge
**Related:** `docs/STACK_MAP.md`, `integrations/alfred/`, `docs/plans/alfred-forge-integration-import.md`

---

## Goal

Port every remaining Forge feature that still forces the 3DPrintForge stack to stay up into **NC 3D Print** (`nc_print`), so Alfred and operators use NC Print only. After Sarge signs off that coverage is complete, retire Forge Studio UI / `:3040` / host forge-slicer in a **separate** PR. Keep `ENGINE_SRC` (or a relocated copy) available for `make slicer-fetch` — the engine binary tree must not vanish with the UI.

Sarge verbal order (2026-10-25): **All** — full port including Alfred cutover, outbound webhooks, parts library, Model Forge subset, Print Guard lite. Forge teardown only after sign-off.

---

## Done criteria

Port is “done” (ready for Sarge to consider Forge teardown) when **all** of the following are true:

1. **Alfred no longer calls Forge.** Monitor cron, `@alfred forge` / Talk dispatch, gates, and OpenClaw skill talk to NC Print APIs (and NC-backed webhooks) only. `FORGE_*` env keys are renamed or aliased to NC equivalents; Forge REST client is gone or a thin deprecated shim.
2. **NC Print emits outbound HMAC-signed webhooks** for the print lifecycle events Alfred/relay already consume (at least: print start / progress / pause / complete / fail / printer offline), with a documented secret and relay path that replaces `forge-webhook-relay`’s Forge dependency.
3. **Parts library** over `/media/4TB/3dprints` is browsable + openable from NC Print (list, thumb, open into prepare/slice) without opening Forge Studio.
4. **Model Forge v1 subset** ships in NC Print (upload / organize / basic prep of STL·3MF into a job) — not the Electron app, not the AI Model Forge product.
5. **Print Guard lite** runs against the live K1 Max path (Moonraker `10.0.0.210:7125`) with the checks operators relied on in Forge (preflight temps / filament / bed clear / basic fault surfacing — exact checklist filled in Wave 6 from Forge source).
6. **Optional Spoolman / notify** wired only if Spoolman (or the existing notify path) is confirmed on in the lab; otherwise documented as deferred with a follow-up plan stub.
7. **Gates green:** `make ship` (and `RESTART=1` when new PHP routes/classes) passes gate-preflight; new behavior covered by phpunit / adapter / vitest as appropriate; live Moonraker smoke where the print path changes.
8. **Browser verify** on the operator logged-in tab at `https://cloud-vdroners.ddns.net/apps/nc_print/` (not `10.0.0.84:8080` / localhost; no credential typing).
9. **Forge still running** until a later `chore/retire-forge` PR is explicitly approved and merged by Sarge. This plan’s PRs must **not** stop `:3040`, forge-slicer, or delete `/media/4TB/3dprintforge`.

---

## Gap list (A–G)

| ID | Gap | Why it blocks retirement | Owner wave |
|----|-----|--------------------------|------------|
| **A** | Alfred → Forge API / monitor / skill still target Forge Studio | Alfred cannot cut over; Forge must stay for agent ops | Wave 1 (+ skill rename Wave 3) |
| **B** | NC Print lacks **outbound HMAC webhooks** for print lifecycle | Relay / Talk / monitor consumers still need Forge events | Wave 2 |
| **C** | OpenClaw skill + docs still say “forge” / `FORGE_*` | Operator and agent muscle memory; incomplete cutover | Wave 3 |
| **D** | Parts **library** over `/media/4TB/3dprints` only first-class in Forge | Operators open Forge to pick STLs/3MFs | Wave 4 |
| **E** | **Model Forge** subset (upload / organize / prep) not in NC | Forge remains the model inbox | Wave 5 |
| **F** | **Print Guard lite** not in NC | Preflight / fault UX still Forge-side | Wave 6 |
| **G** | Optional **Spoolman / notify** if enabled in lab | Nice-to-have parity; confirm before coding | Wave 7 |

### Already in NC Print (~95% of operator slice/print)

Do **not** re-port these; reuse and extend:

- Slicer Studio prepare → slice → send (nc-print-slicer sidecar, Orca-lineage)
- Moonraker proxy / printer state / camera path for K1 Max (`K1Max-Printy-Baby` @ `10.0.0.210`)
- Calibration / profile flows already shipped in `nc_print`
- Deploy / gates / `make ship` lab recipe (`CLAUDE.md`)
- Host-side Alfred glue **files** already live under `integrations/alfred/` but still **point at Forge** — port the *targets*, not a second copy of the tree

### Out of scope (explicit non-goals)

- Multi-brand printer fleets / CRM / marketing site
- Forge **Electron** desktop shell
- **AI** Model Forge product features
- Running a **second** slicer on `:8766` for NC Print (NC keeps `nc-print-slicer` only)
- Silent teardown of Forge or force-push to `main`
- Committing the ~380 MB engine binary (continue `make slicer-fetch` from `ENGINE_SRC`)

---

## ENGINE_SRC caveat

`make slicer-fetch` refreshes the sidecar engine from:

```text
/media/4TB/3dprintforge/slicer/3dprintforge-slicer/   # ENGINE_SRC
```

**Implication:** retiring the Forge **UI** / compose / `:3040` / forge-slicer unit must **not** delete this tree until either:

1. `ENGINE_SRC` is relocated (e.g. `/media/4TB/nc-print-engine/` or under `nc-print/slicer/upstream/`) and Makefile / STACK_MAP / docs are updated in the same teardown PR, **or**
2. Sarge explicitly accepts keeping a slim “engine only” checkout under the old path.

Wave 8 / `chore/retire-forge` checklist must include an ENGINE_SRC decision. Until then, leave the tree alone.

---

## PR waves (1–8)

Each wave: branch from up-to-date `main` → implement → bump (`make bump-minor` for features, `bump-patch` for fixes) → fill CHANGELOG stub + README line → `make ship` (+ `RESTART=1` if new PHP route/controller/class) → browser verify → open GitHub PR → **Sarge merges**. Forge teardown is **not** in waves 1–7.

### Wave 1 — `feat/forge-port-alfred-nc-client`

**Closes:** Gap A (client half)

- Point `integrations/alfred/scripts/lib/forge_api.py` (or successor `nc_print_api.py`) at NC Print / Moonraker-backed endpoints instead of Forge Studio REST.
- Update monitor cron + gates to health-check NC Print + `nc-print-slicer` + Moonraker (`10.0.0.210:7125`), not Forge `:3040` / `:8766`.
- Keep Forge URLs as optional fallback behind an env flag until Wave 2–3 land (document kill date).
- **Does not** remove Forge UI.
- Tests: adapter/script gates green; `alfred-cron-…` dry-run against NC; document new env keys in `integrations/alfred/env.example`.

### Wave 2 — `feat/forge-port-outbound-webhooks`

**Closes:** Gap B

- Add NC Print outbound webhook delivery (HMAC-signed) for print lifecycle events the relay already expects.
- New PHP routes/classes → `make ship RESTART=1`.
- Re-point or dual-run `forge-webhook-relay` / CPM route to NC-signed events; keep Forge webhook until Alfred confirms NC path.
- Secrets: follow existing Alfred secrets bootstrap patterns; never commit secrets.
- Tests: unit for signature + payload; gate for route allowlist (G46–G50); one live event smoke if a printer job is available (do not interrupt an active PA-CF job without Sarge OK).

### Wave 3 — `feat/forge-port-alfred-skill-rename`

**Closes:** Gap C

- Rename / alias OpenClaw skill `forge-print` → NC-facing name (e.g. `nc-print` / `print`); update Talk matcher strings carefully so old `@alfred forge` still works during transition.
- Docs: `integrations/alfred/docs/FORGE-INTEGRATION.md` → NC Print integration guide (keep redirect stub).
- Env: `FORGE_*` → `NC_PRINT_*` (or dual-read).
- Flip default monitor target to NC; remove Forge fallback only after Sarge OK in this or a tiny follow-up patch.

### Wave 4 — `feat/forge-port-parts-library`

**Closes:** Gap D

- NC Print UI panel + API to browse `/media/4TB/3dprints` (respect Nextcloud / host permissions model already used in lab).
- Actions: list, thumbnail if present, open into prepare/slice, basic delete/rename only if Forge had them and operators still need them (confirm in PR).
- Do not duplicate files into Nextcloud userdata unless required for sharing; prefer the shared host path.
- Tests: API + vitest for panel; browser verify open → slice path.

### Wave 5 — `feat/forge-port-model-forge-v1`

**Closes:** Gap E

- **Subset only:** upload STL/3MF, attach to library or job, basic prep hooks already in Slicer Studio.
- Explicitly out of scope: Electron shell, AI generation, CRM.
- Reuse Wave 4 library storage where possible.
- Bump minor; CHANGELOG + README feature line.

### Wave 6 — `feat/forge-port-print-guard-lite`

**Closes:** Gap F

- Inventory Forge Print Guard checks from `/media/4TB/3dprintforge` source in the PR description, then implement the lite subset in NC (preflight before send + in-print fault surfacing via Moonraker).
- Live checks against K1 Max when safe (printer idle).
- Do not block send forever on flaky Wi-Fi — align with existing timeout docs (`docs` K1 Max Wi-Fi note).

### Wave 7 — `feat/forge-port-spoolman-notify` (optional)

**Closes:** Gap G **if** Spoolman / notify is on in lab

- First commit in the branch: a short “lab probe” note in the PR (is Spoolman running? which URL?).
- If off: close gap as **deferred**, add `docs/plans/spoolman-nc-print.md` stub, no feature code.
- If on: minimal NC integration parity with Forge’s Spoolman/notify hooks only.

### Wave 8 — `chore/retire-forge` (**separate**, after Sarge sign-off)

**Does not start until Sarge explicitly says NC Print covers needed Forge features.**

- Stop advertising Forge Studio in STACK_MAP / OPERATOR docs; mark `:3040` / forge-slicer deprecated.
- Tear down compose / systemd unit / reverse-proxy routes only with Sarge OK.
- **ENGINE_SRC decision** (relocate vs keep slim tree) landed in the same PR.
- Do **not** `git add -A` a 380 MB binary; do not delete `/media/4TB/3dprints`.
- Final browser + Alfred monitor verification on NC-only path for ≥ one print cycle preferred.

---

## Teardown checklist (for Wave 8 only — do not run now)

Use this as the PR checklist later; **all items default unchecked today**.

- [ ] Sarge written OK that Waves 1–7 (or agreed subset) meet ops needs
- [ ] Alfred monitor + Talk path verified NC-only for a full print or dry-run cycle
- [ ] Outbound webhooks delivering from NC; Forge webhook disabled
- [ ] Parts library + Model Forge v1 used successfully from `cloud-vdroners.ddns.net/apps/nc_print/`
- [ ] Print Guard lite exercised on idle printer
- [ ] `ENGINE_SRC` relocated **or** slim tree retained; `make slicer-fetch` still works
- [ ] `docker compose` / systemd for Forge Studio and forge-slicer stopped
- [ ] STACK_MAP, CLAUDE.md cross-links, Alfred env examples updated
- [ ] No open process still binding `:3040` / `:8766` unless intentionally kept for engine
- [ ] Backup note: `/media/4TB/3dprintforge` tarball or git remote known before delete
- [ ] **Not deleted yet:** `/media/4TB/3dprints`, NC Print slicer compose, Moonraker on printer

---

## What NOT to delete or stop yet

Until Wave 8 is merged by Sarge:

| Keep running / on disk | Why |
|------------------------|-----|
| `/media/4TB/3dprintforge` tree | ENGINE_SRC + rollback |
| Forge Studio `:3040` | Alfred / operator fallback |
| Host `forge-slicer` `:8766` | Forge UI dependency |
| `forge-webhook-relay` | Dual-run during Waves 1–3 |
| `/media/4TB/3dprints` | Shared library data |
| `nc-print-slicer` + `cloud_app` | Primary path |

---

## Ship / verify notes (every implementation wave)

From `/media/4TB/nc-print`:

```bash
make bump-minor   # or bump-patch — then fill CHANGELOG + README by hand
make ship         # build + slicer-up + deploy + gate-preflight
make ship RESTART=1   # REQUIRED if this wave added PHP routes/controllers/classes
```

| Changed | build | slicer-up | RESTART=1 | bump |
|---------|-------|-----------|-----------|------|
| Vue / stores / services | yes | no | no | yes |
| PHP method body only | no | no | no | yes |
| NEW PHP route / controller / class | no | no | **yes** | yes |
| `slicer/adapter/*.py` | no | **yes** | no | yes |
| `integrations/alfred/*` only | no | no | no | usually no (docs/scripts; note in PR) |
| docs / this plan only | no | no | no | no |

**Browser:** operator’s logged-in Cursor browser tab → `https://cloud-vdroners.ddns.net/` → `/apps/nc_print/` → reload after deploy. Never `10.0.0.84:8080` / localhost for sign-off; never type credentials; ask Sarge to log in if needed. Rule: `/media/4TB/nc-gcs/.cursor/rules/browser-testing.mdc`.

**Printer:** Moonraker `http://10.0.0.210:7125` — do not cancel an active job for testing without Sarge OK.

---

## Commit / PR hygiene (Alfred + CLAUDE.md)

- Plan first (this file) — commit with or just before code.
- Branch naming: `feat/forge-port-<short>` for waves 1–7; `chore/retire-forge` for wave 8.
- Stage **only** files for the task — **never** `git add -A`.
- Author/committer stamps per `CLAUDE.md` (`Sarge` / `dan@19labs.com`); no Cursor trailer; Claude co-developed-by as last line when Claude was used.
- Open PR on GitHub `vdroners/nc-print` → `main`; body must include: plan link, gap closed, gates run, browser checks, residual risk, and **explicit “Forge teardown is NOT in this PR”** for waves 1–7.
- **Sarge merges** (or explicitly orders a merge). Do not merge yourself; do not force-push `main`.
- If CLAUDE.md conflicts with a new verbal order from Sarge, his verbal order wins — ask once, then update this plan.

### Sanitized commit recipe (from CLAUDE.md)

```bash
env -i HOME=$HOME PATH=/usr/local/bin:/usr/bin:/bin USER=$USER \
   GIT_AUTHOR_NAME="Sarge" GIT_AUTHOR_EMAIL="dan@19labs.com" \
   GIT_COMMITTER_NAME="Sarge" GIT_COMMITTER_EMAIL="dan@19labs.com" \
   git -C /media/4TB/nc-print commit -F <clean-msg-file> --cleanup=verbatim
```

Verify: `git log -1 --pretty=%B | grep -i cursor` must be empty.

---

## Suggested PR body template (waves 1–7)

```markdown
## Summary
Ports <gap X> from 3DPrintForge into NC Print per docs/plans/forge-port.md.

## Plan
docs/plans/forge-port.md — Wave N

## Gap closed
- …

## Verify
- [ ] make ship (RESTART=1 if new PHP)
- [ ] gate-preflight / relevant tests
- [ ] Browser: https://cloud-vdroners.ddns.net/apps/nc_print/
- [ ] Moonraker smoke (if print path touched)

## Residual risk
- …

## Forge teardown
**NOT in this PR.** Forge Studio / :3040 / forge-slicer remain until chore/retire-forge after Sarge sign-off.
```

---

## One-liner for Sarge

Work in `/media/4TB/nc-print` → this plan → `feat/forge-port-*` waves → `make ship` (+ `RESTART=1` if new PHP) → PR to `vdroners/nc-print` → you merge → Forge removal is a later `chore/retire-forge` only after you sign off. ENGINE_SRC stays until that teardown PR decides relocate vs slim keep.

---

## Immediate next step after this plan lands

1. Merge/accept this plan commit (docs-only; no bump).
2. Start **Wave 1** (`feat/forge-port-alfred-nc-client`) — Alfred NC client + monitor health — without touching Forge processes.
