# K1 Max: Creality Print send fails ("unknown error", timeout) — Wi-Fi link

Creality Print (7.x) shows a generic **"unknown error"** when sending a job to
the lab K1 Max (`10.0.0.210`). Its own log says why:

```text
WebSocket proxy session failed ... close timeout
stream truncated
send failure error_code 28 (timeout) for <file>.gcode
```

Error 28 is curl's operation timeout. The printer is online (`/info` answers,
Moonraker is `ready`); the upload simply cannot finish inside the app's timeout.

## Root cause

The printer's **Wi-Fi link**, not the app version. Measured 2026-10-22 from the
wired GCS host (`10.0.0.84`, same LAN, sub-2 ms to every other host):

| Measurement | Value | Healthy |
|---|---|---|
| ping to printer (30 pkts) | 143 ms avg, 440 ms max, 6.7 % loss | < 20 ms, 0 % |
| `wl rate` / `wl rssi` / `wl noise` on printer | 5.5 Mbps / -72 dBm / -91 dBm | >= 24 Mbps / better than -65 |
| radio capability (`wl bands`) | `b` (2.4 GHz only) | n/a |
| AP seen by printer | "Sheela 6R", channel 2 (2417 MHz), -77 dBm, only BSS visible | channel 1/6/11, -65 or better |
| power save (`wl PM`) | 2 (fast PM) | 0 while sending |
| bulk transfer (Moonraker range GET, 1.05 MB) | 274 s = 0.03 Mbit/s | > 2 Mbit/s |
| printer outbound while a client is connected | ~1.2 Mbit/s (webrtc camera + status) | n/a |
| web-server.log, 09:23-09:54 | 9 reconnects from the Creality Print PC, then the 1.1 MB gcode landed | 1 connect per send |
| dmesg | flood of `dhd_tcpdata_info_get: No more free tdata_psh_info` | none |

Reading: a 5.5 Mbps 802.11b link at ~19 dB SNR is half-duplex airtime shared with
the printer's own ~1.2 Mbit/s camera stream. Bulk uploads crawl at tens of
kbit/s, every send races the app's timeout, and the bcmdhd driver's TCP-ACK
suppression table overflows under the retransmits. Once a send does squeak
through (it did, twice that day), the job prints normally.

Ruled out:

- **Creality Print 7.3 regression** — the same 7.3 build sent the file at 09:54
  and an 8-hour job afterwards; nothing changed but link luck.
- **Printer clock / TLS** — `date` and NTP are correct. The factory TLS cert on
  `:443` (`/usr/share/cert/server.crt`, CN "My Server", issuer "My Private CA")
  expired 2026-08-29, but Creality Print does not verify it (the wss handshake
  completes in 0.7 s from a wired host). Latent, firmware-owned; nothing to do
  unless a future Creality Print enforces validation.
- **Klipper / Moonraker** — both healthy; this is a different "unknown error"
  from the `key61` popup in
  [printer-unknown-error-key61.md](printer-unknown-error-key61.md).

## Diagnose (read-only, safe during a print)

The printer is busybox (no `timeout`); it has `wl`, `wpa_cli`, `ss`. Root SSH
alias `k1-max` is in `~/.ssh/config` on the GCS host.

```bash
P=10.0.0.210
ping -c 30 -i 0.2 -W 1 -q $P | tail -2                       # loss + jitter
ssh k1-max 'wl rssi; wl noise; wl rate; wl PM; wl bands; \
            wpa_cli -i wlan0 status | grep -E "ssid|freq"; \
            cat /proc/net/wireless | tail -1'                 # radio state
ssh k1-max 'S=/sys/class/net/wlan0/statistics; a=$(cat $S/tx_bytes); sleep 10; \
            echo $(( ($(cat $S/tx_bytes)-a)*8/10000 )) kbit/s out'   # camera load
curl -s http://$P/info                                        # wssPort/videoPort
F=$(curl -s "http://$P:7125/server/files/list" | python3 -c \
    'import sys,json;print(json.load(sys.stdin)["result"][0]["path"])')
curl -s -r 0-1048575 -o /dev/null -w '%{speed_download} B/s\n' \
    "http://$P:7125/server/files/gcodes/$F"                   # bulk throughput
ssh k1-max 'grep -oE "on(open|close)[:=] [0-9.]+" \
    /usr/data/creality/userdata/log/web-server.log | sort | uniq -c'  # churn
ssh k1-max 'dmesg | grep -c tdata_psh_info'                   # driver pressure
```

Do not change Wi-Fi settings, certificates or services while
`print_stats.state` is `printing`
(`curl -s "http://$P:7125/printer/objects/query?print_stats"`).

## Fix, in order of payoff

1. **Fix the radio path.** Put a 2.4 GHz AP or mesh node within clean range of
   the printer, or move the AP. Target RSSI better than -65 dBm and `wl rate`
   of 24 Mbps or more. Set that AP's 2.4 GHz radio to **channel 1, 6 or 11 at
   20 MHz**; channel 2 overlaps both 1 and 6 and collects everyone's noise.
   The K1 Max radio is 2.4 GHz only (`wl bands: b`), so a 5 GHz SSID does not
   help.
2. **Starve the link less while sending.** Close the camera / device view in
   Creality Print before pressing Send, so the printer is not streaming
   ~1.2 Mbit/s of video over the same airtime. Sending from Fluidd
   (`http://10.0.0.210:4409`) also works on a slow link because a browser
   upload has no 30-second client timeout; it is the same radio, just patient.
3. **No wired fallback exists.** `eth0` on the K1 Max is the SoC's stmmac MAC
   with no connector, and kernel 4.4.94 ships no USB-Ethernet drivers (only
   `cdc_acm`, `ch341`, `usb-storage`, `uvcvideo`, `usbhid`, `usbserial`). A
   USB NIC will not come up on stock firmware.
4. **Printer-side experiment, idle only, reverts on reboot:** `wl PM 0`
   disables Wi-Fi power save. It trims latency spikes but does not raise the
   5.5 Mbps rate; measure before and after with the commands above and only
   keep it if the numbers move.

## Verify

| Check | Command | Pass |
|---|---|---|
| Link | `ping -c 30 -i 0.2 -q 10.0.0.210` | < 1 % loss, avg < 20 ms |
| Rate | `ssh k1-max wl rate` | >= 24 Mbps |
| Bulk | range GET above | > 2 Mbit/s |
| App | Creality Print Send | completes first try, one `onopen` in web-server.log |

## Where things live on the printer

| Item | Path |
|---|---|
| Creality web-server log (WebSocket open/close, sends) | `/usr/data/creality/userdata/log/web-server.log` |
| Creality app-server log (cloud, MQTT) | `/usr/data/creality/userdata/log/app-server.log` |
| Moonraker log (uploads, job start) | `/usr/data/printer_data/logs/moonraker.log` |
| G-code store | `/usr/data/printer_data/gcodes/` |
| TLS cert for :443 (and factory copy) | `/usr/share/cert/server.{crt,key}`, `/etc/sysConfig/defData/cert/` |
| Wi-Fi config | `/usr/data/wpa_supplicant.conf` |
| Firmware version | `/usr/data/creality/userdata/config/system_version.json` (1.3.5.22) |
