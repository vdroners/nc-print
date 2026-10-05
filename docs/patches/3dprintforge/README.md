# 3DPrintForge lab patches

Forge Studio (`/media/4TB/3dprintforge/src`) is a clone of the upstream
[`skynett81/3dprintforge`](https://github.com/skynett81/3dprintforge) repo that
we cannot push to. Our local changes live on branch `lab-1.1.25` there, and a
copy of each commit is kept here so they survive a lost disk or a fresh clone.

| Patch | Base | What it does |
|---|---|---|
| `0001-Moonraker-client-hardening-for-the-lab-Klipper-print.patch` | upstream `v1.1.25` (`9e0523b0`) | Klipper subscribe filter, stale-state watchdog + keepalive + HTTP poll, Moonraker file list / print start via `/api/printers/:id/files` |

Re-apply on a fresh clone:

```bash
git clone https://github.com/skynett81/3dprintforge.git src && cd src
git checkout -b lab-1.1.25 9e0523b0
git am /media/4TB/nc-print/docs/patches/3dprintforge/*.patch
```

When upstream moves past 1.1.25, rebase `lab-1.1.25`, re-export with
`git format-patch <new-base>..lab-1.1.25 --zero-commit -o <this dir>` and update
the table. See [`../../STACK_MAP.md`](../../STACK_MAP.md) for how Forge Studio
sits next to NC Print.
