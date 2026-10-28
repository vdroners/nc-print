# K1 Max: Offline while the camera or stock UI still works

Lab printer: Creality K1 Max `K1Max-Printy-Baby` at `10.0.0.210`.
NC Print `moonraker_internal_url` is `http://10.0.0.210:7125`. That URL is
correct. This is not a config bug.

## Symptom

NC Print shows **Offline** or **Link lost** / Moonraker unreachable. The
printer's stock UI (`http://10.0.0.210/`) and camera (`:8080`) often still
answer. A host `curl` to Moonraker sometimes fails and then succeeds on
the next try.

## Root cause

Weak Wi-Fi because the printer is far from the AP. `eth0` on this machine
is down (no usable Ethernet jack on stock firmware — see
[k1-max-wifi-send-timeouts.md](../troubleshooting/k1-max-wifi-send-timeouts.md)).

Measured on the lab link while it was far:

| Check | Ballpark |
|---|---|
| RSSI | about −73 dBm |
| Link speed | about 2 Mbps |
| Retries / discards | high |
| Recovering `GET /printer/info` | about 3.1 s |

Moonraker (`:7125`) drops first. The camera and stock UI can stay up on
the same radio.

## What to do, best first

1. **Ethernet** if a future cable path exists. On this K1 Max, `eth0` is
   currently unused and the stock board has no Ethernet jack, so this may
   not be available without different hardware.
2. **Move the AP closer**, or use a better 2.4 GHz AP. The K1 radio is
   2.4 GHz only. Target better than about −65 dBm.
3. **Wi-Fi extender or mesh node** near the printer.
4. **Software timeouts** (this app, last resort). NC Print waits longer
   for Moonraker status probes and retries one transient connect failure.
   That does not fix a bad radio. It only stops a 3-second recovery from
   looking like a dead printer. Bulk sends can still be slow; see the
   send-timeout note linked above.

## Check from the vdroners host

```bash
curl -sS -m 15 -w '\nhttp=%{http_code} time=%{time_total}\n' \
  http://10.0.0.210:7125/server/info
ssh k1-max 'wpa_cli signal_poll; echo ---; cat /proc/net/wireless'
```

`signal_poll` RSSI and `LINKSPEED`, plus the wireless retry counters, tell
you whether the link is the problem. Do not change Wi-Fi settings while a
print is running.

## What the app shows

After a good reading, a failed probe is **Link lost** with **Last seen**
age. If a job was printing, progress stays at the last known percent, or
an estimate labeled **Estimated from last contact** when Moonraker had
already reported at least a minute of progress. The next successful
answer switches back to live status immediately. A printer that has never
answered still shows a hard **Printer offline**.

Creality Print **Unknown error** while the job still runs is a different
fault (Klipper `key61`). See
[printer-unknown-error-key61.md](../troubleshooting/printer-unknown-error-key61.md).
A send that never lands is
[k1-max-wifi-send-timeouts.md](../troubleshooting/k1-max-wifi-send-timeouts.md).
