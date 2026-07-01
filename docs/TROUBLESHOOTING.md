# Troubleshooting

| Symptom | Check |
|---------|--------|
| 403 on app | User not in allowed group (see Admin) |
| Slicer unreachable | `curl http://127.0.0.1:8766/api/health` from Nextcloud host |
| Moonraker offline | `curl http://10.0.0.210:7125/server/info` |
| Slice stream ends early | forge-slicer logs; verify multipart fields in admin proxy logs |
