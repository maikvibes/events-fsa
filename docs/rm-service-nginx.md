# Remove host-system nginx

The project no longer uses a host-system nginx TCP proxy. Postgres, Kafka, and Redis publish ports directly and handle TLS themselves. Run these commands on the server to clean up.

## 1. Remove events-fsa nginx config

```bash
sudo rm -rf /etc/nginx/events-fsa
```

## 2. Remove the stream block from nginx.conf

Open `/etc/nginx/nginx.conf` and delete the `stream { }` block that was appended by `bootstrap.sh`. It looks like:

```nginx
stream {
    include /etc/nginx/events-fsa/stream.conf.d/*.conf;
}
```

Or use sed to remove it:

```bash
sudo sed -i '/# BEGIN events-fsa stream/,/# END events-fsa stream/d' /etc/nginx/nginx.conf
```

If the block has no markers, open the file and delete it manually.

## 3. Remove the stream module symlink

```bash
sudo rm -f /etc/nginx/modules-enabled/50-mod-stream.conf
sudo rm -f /etc/nginx/modules-available/50-mod-stream.conf
```

## 4. Remove TLS material from host ssl dir

These files were installed by bootstrap.sh and are no longer needed at the host level (certs now live in `./certs/` in the project directory):

```bash
sudo rm -rf /etc/ssl/events-fsa
```

## 5. Reload or stop nginx

If you still use nginx for other sites, reload it:

```bash
sudo nginx -t && sudo systemctl reload nginx
```

If nginx is no longer needed at all:

```bash
sudo systemctl disable --now nginx
```

## 6. Remove /etc/hosts entries (optional)

The `generate-hosts.sh` script wrote entries for `postgres`, `kafka`, and `redis`. These are still useful if you want to connect from the host using those names. To remove them:

```bash
sudo sed -i '/# events-fsa: managed by scripts\/generate-hosts.sh/,/^$/d' /etc/hosts
```

## New port layout

| Service  | Host port | Protocol      |
|----------|-----------|---------------|
| Postgres | 5432      | TLS + scram-sha-256 |
| Redis    | 6379      | TLS + ACL     |
| Kafka    | 29092     | PLAINTEXT (inter-broker only) |
| Kafka    | 29093     | SSL (in-cluster apps) |
| Kafka    | 29094     | SASL_SSL (external clients) |
