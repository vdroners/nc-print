# Verify

```bash
make gate-preflight
npm run test
vendor/bin/phpunit
```

After deploy to Docker:

```bash
docker exec -u www-data cloud_app php /var/www/html/custom_apps/nc_print/tools/print-api-gates.php
curl -s -u USER:PASS https://YOUR/cloud/index.php/apps/nc_print/api/status
```
