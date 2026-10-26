# Wave 2 — NC outbound HMAC webhooks

See `docs/plans/forge-port.md` Gap B.

## Config (Admin or occ)

```bash
docker exec cloud_app sudo -u www-data php occ config:app:set nc_print outbound_webhook_enabled --value 1
docker exec cloud_app sudo -u www-data php occ config:app:set nc_print outbound_webhook_url --value 'https://alfred-vdroners.ddns.net/forge-webhook'
docker exec cloud_app sudo -u www-data php occ config:app:set nc_print outbound_webhook_secret --value "$(cat ~/.openclaw/.env.d/forge-webhook.secret)"
```

Secret must match the relay's `FORGE_WEBHOOK_SECRET` / `NC_PRINT_WEBHOOK_SECRET`.

## Events

Fired from `PrintEventController::notifyTransition`: `print_started`, `print_finished`, `print_failed`, `print_cancelled`.
Header: `X-Hub-Signature-256: sha256=<hmac>`. Payload includes `"source":"nc_print"`.

## Relay

Update host copy of `forge-webhook-relay.py` from `integrations/alfred/docs/templates/` (or re-run docker relay setup) so Talk posts use `[nc_print]` when `source=nc_print`.
