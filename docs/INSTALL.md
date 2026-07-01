# Install

1. Copy or deploy this app to `custom_apps/nc_print` on your Nextcloud server.
2. Enable: `occ app:enable nc_print`
3. Configure admin settings (Settings → NC 3D Print): slicer URL, Moonraker URL, allowed groups.
4. Run `npm run build` before deploy (or `make deploy` from the repo root).
