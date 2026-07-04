# NC-Print Post-Change Workflow

nc-print is a standalone Nextcloud app (Vue 2 + Pinia frontend in `src/`, PHP
backend in `lib/`) plus an owned Python slicer sidecar (`slicer/adapter/`) that
drives an OrcaSlicer-fork CLI. After every change, run this workflow before
reporting completion, and include it in every plan.

## 0. Plan first (large changes)

Multi-file features / behavior changes / new endpoints: write a plan to
`docs/plans/<slug>.md` and commit it with (or just before) the implementation.
Trivial one-file tweaks and docs-only edits don't need a checked-in plan.

## 1. Version bump (if warranted)

Bump when a change adds features, fixes bugs, or changes behavior. Skip for
docs/config-only. Version lives in five places — use the Makefile targets so they
stay in sync:

```bash
make bump-patch   # bug fixes / small changes (1.27.0 -> 1.27.1)
make bump-minor   # new features           (1.27.0 -> 1.28.0)
```

These edit `appinfo/info.xml`, `package.json`, `package-lock.json` (both version
fields), the `README.md` badge, and insert a dated `## [x.y.z]` stub at the top of
`CHANGELOG.md`. Fill in the CHANGELOG stub and add a README feature line by hand.

## 2. Build the frontend

```bash
make build     # sass + webpack production; must exit 0
```

## 3. Ship (build + sidecar + deploy + gate) — one step

```bash
make ship              # = build + slicer-up + deploy + gate-preflight
make ship RESTART=1    # when a NEW route or PHP class was added this change
```

`make deploy` now: removes the target subdirs in the container before copying
(so files DELETED from source don't linger — we shipped a stale controller once),
`chown`s to www-data, runs `occ upgrade`, and flushes the CLI opcache.

**Opcache caveat (important):** php-fpm workers each hold their own opcache. When
you ADD a route or class (not just edit a method body), the running workers can
serve a **stale `routes.php` and 404 the new route** even though it's registered
(`occ router:match` will show it correctly). Pass `RESTART=1` (bounces the
container) whenever this change adds a route/controller/class. Editing existing
code does not need RESTART.

If you can't use `make ship`, the manual order is: `make build` → `make slicer-up`
(only if adapter changed) → `make deploy [RESTART=1]` → `make gate-preflight`.

## 4. Verify

`make ship` already runs `gate-preflight` (preflight + phpunit + adapter tests +
vitest + build + API gates G00–G50). Additionally, where a change touches
Moonraker/the sidecar, verify e2e against the live printer (e.g. probe
`/api/printer/state`, exercise the new endpoint). New routes/allowlist entries are
smoke-checked by gates G46–G50 against the DEPLOYED files (this also catches the
opcache-stale-routes bug).

## 5. Tests

```bash
make test          # phpunit + adapter (python) + vitest
make slicer-test   # adapter unit tests only
make run-phpunit   # phpunit only (host, container, or php image fallback)
npm run test       # vitest only
```

vitest defaults every `src/__tests__/**` spec to the `happy-dom` environment. A
spec that must run under node (e.g. reads a file via `new URL(..., import.meta.url)`)
opts out with a top-of-file docblock: `/** @vitest-environment node */`.

## 6. Commit & push

Stage only the files this task changed (never `git add -A`; the tree often has
parallel in-flight changes). The sanitized commit recipe avoids the Cursor
trailer and stamps the Claude attribution as the LAST line:

```bash
env -i HOME=$HOME PATH=/usr/local/bin:/usr/bin:/bin USER=$USER \
   GIT_AUTHOR_NAME="Sarge" GIT_AUTHOR_EMAIL="dan@19labs.com" \
   GIT_COMMITTER_NAME="Sarge" GIT_COMMITTER_EMAIL="dan@19labs.com" \
   git -C /media/4TB/nc-print commit -F <clean-msg-file> --cleanup=verbatim
```

- Verify no Cursor line: `git log -1 --pretty=%B | grep -i cursor` must be empty.
- Last non-blank line MUST be the Claude co-developed-by trailer.
- Push: `git push origin main` (remote is `origin` → GitHub `vdroners/nc-print`).

## Scope → what to deploy

| Changed | build | slicer-up | RESTART=1 | bump |
|---|---|---|---|---|
| Vue / stores / services | yes | no | no | yes |
| PHP controller/lib method body | no | no | no | yes |
| NEW PHP route / controller / class | no | no | **yes** | yes |
| `slicer/adapter/*.py` | no | **yes** | no | yes |
| `appinfo/info.xml` (routes) | no | no | **yes** | yes |
| docs / README only | no | no | no | no |

## Engine facts worth knowing

The sidecar engine `/opt/orca/3dprintforge-slicer` is a full OrcaSlicer-lineage
binary. It slices a project `.3mf` and reads OrcaSlicer's `Metadata/
model_settings.config` (per-object settings) and per-triangle `p:` paint
attributes. Judge engine feature support by testing the binary
(`--help`, inspect a shipped `.3mf`), NOT by grepping the global process/filament
presets (those are global by design).
