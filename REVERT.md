# Revert playbook

This is a step-by-step runbook for tearing down the infrastructure stack
that lives in `docker-compose.infra.yml`, removing every file it created,
reverting every change it made to system paths, and leaving the host
and the repository exactly as they were before the setup.

Pick the level you need:

| Goal | Section |
| --- | --- |
| Stop the stack, keep generated files and data | [1. Soft stop](#1-soft-stop) |
| Stop the stack and delete data volumes | [2. Stop + wipe data](#2-stop--wipe-data) |
| Stop the stack, wipe data, and remove every generated file + system change | [3. Full revert](#3-full-revert) |
| Remove the entire infra from git history | [4. Scrub git history](#4-scrub-git-history) |
| I just want a one-liner | [5. One-liners](#5-one-liners) |

All commands assume you are at the repository root unless noted.

> **Destructive commands are marked with ⚠️.** Read the table twice before
> running them.

---

## 1. Soft stop

Use this when you want to stop the running services but keep the
generated cert material, secrets, and data so you can start them again
later.

```bash
docker compose -f docker-compose.infra.yml down
```

What this does:
- Stops and removes the `postgres`, `zookeeper`, `kafka`, `redis` containers
- Removes the `events-fsa-infra_backend` docker network
- **Keeps** the named volumes (`postgres_data`, `kafka_data`,
  `redis_data`, `zookeeper_data`, `zookeeper_logs`) — your data is
  preserved
- **Keeps** every file under `nginx/certs/`, `secrets/`, and `.env`
- **Keeps** every system-path change made by `bootstrap.sh`

To bring the stack back up:

```bash
docker compose -f docker-compose.infra.yml up -d
```

---

## 2. Stop + wipe data

Use this when you want a clean restart with fresh databases, topics, and
Redis state. This **destroys all data** in the data services.

```bash
docker compose -f docker-compose.infra.yml down --volumes --remove-orphans
```

What this does:
- Everything from [Section 1](#1-soft-stop)
- ⚠️ Deletes the named volumes:
  - `events-fsa-infra_postgres_data`
  - `events-fsa-infra_zookeeper_data`
  - `events-fsa-infra_zookeeper_logs`
  - `events-fsa-infra_kafka_data`
  - `events-fsa-infra_redis_data`

Generated certs, the `.env` file, and the system-path material are
**kept**. To reuse them, just run:

```bash
docker compose -f docker-compose.infra.yml up -d
```

If you also want to rotate the secrets, regenerate them first:

```bash
./scripts/generate-secrets.sh --force
./scripts/render-templates.sh
```

---

## 3. Full revert

Use this when you want the host and the repository to look like they did
**before** the infra setup. Removes the stack, the data, the certs, the
secrets, every file the setup added, and every system change.

> ⚠️ **This is destructive.** Postgres data, Kafka topics, Redis state,
> and every generated secret/cert are deleted. The CA is also removed.
> Run `./scripts/bootstrap.sh` again to recreate the infra.

### 3.1 Remove the stack and wipe data

```bash
docker compose -f docker-compose.infra.yml down --volumes --remove-orphans
```

### 3.2 Remove the infra files added to the repo

```bash
rm -rf \
  .env \
  nginx/certs \
  secrets \
  scripts/redis-acl.conf

rm -f \
  docker-compose.infra.yml \
  INFRA.md \
  REVERT.md \
  .env.example

rm -rf \
  nginx \
  scripts
```

### 3.3 Revert system-path changes

```bash
echo "221205" | sudo -S rm -rf /etc/nginx/events-fsa
echo "221205" | sudo -S rm -f  /etc/ssl/events-fsa
echo "221205" | sudo -S rm -f  /etc/nginx/modules-enabled/50-mod-stream.conf
echo "221205" | sudo -S rm -f  /etc/nginx/modules-available/50-mod-stream.conf
```

### 3.4 Remove the stream block from `/etc/nginx/nginx.conf`

Open `/etc/nginx/nginx.conf` and delete the trailing `stream { ... }`
block (added by `bootstrap.sh`). Or:

```bash
echo "221205" | sudo -S cp /etc/nginx/nginx.conf /etc/nginx/nginx.conf.bak
# Then hand-edit to remove the trailing "stream {" block and reload.
echo "221205" | sudo -S nginx -t
echo "221205" | sudo -S systemctl reload nginx
```

### 3.5 Remove the `/etc/hosts` block

`scripts/generate-hosts.sh` writes a managed block. Re-run it with the
block set to empty, or remove manually. Easiest: re-run bootstrap with
an empty list and `sed` out the marker:

```bash
# Remove every line that is part of the managed block, including the
# marker line itself.
echo "221205" | sudo -S sed -i '/^# events-fsa: managed by scripts\/generate-hosts.sh/,/^$/d' /etc/hosts
```

Or open `/etc/hosts` and remove the four lines:

```
# events-fsa: managed by scripts/generate-hosts.sh - do not edit
172.30.0.10 postgres
172.30.0.11 kafka
172.30.0.12 redis
172.30.0.13 zookeeper
```

### 3.6 Remove the libnginx-mod-stream module (optional)

If you do not need `ngx_stream_module.so` for anything else, uninstall
the package:

```bash
echo "221205" | sudo -S apt-get remove -y libnginx-mod-stream
```

If you do keep it for other stream blocks, just leave the symlink in
`/etc/nginx/modules-enabled/`.

### 3.7 Restore `.gitignore`

The setup added the following block to `.gitignore`. Revert that block
with `git checkout -- .gitignore` if the only change to it is the
added infra entries. If `.gitignore` had pre-existing entries you care
about, edit the file manually and remove these lines:

```gitignore
# Secrets and generated material
.env
.env.*
!.env.example
secrets/
nginx/certs/

# Local app secrets
firebase-adminsdk*.json
*.pem
*.key
*.crt
*.jks
*.p12
*.p8
*.pkcs12
```

The `*.pem / *.key / *.crt / *.jks / *.p12` lines are intentionally
broad globs that the setup added. If your project never had reason to
ignore those, delete the whole block.

### 3.8 What stays in the repo

After a full revert, the only files tied to the infra that may remain
are:

- `docker-compose.yml` — the original app compose, **unchanged**
- `Dockerfile`, `apps/`, `libs/`, `package.json`, etc. — **unchanged**
- `README.md` — the default NestJS README, **unchanged**
- `.gitignore` — back to its pre-infra state

### 3.9 Sanity check

```bash
git status            # Should show the deleted files; nothing else dirty
git diff --stat HEAD~  # Review before committing the revert
```

---

## 4. Scrub git history

Only relevant if the infra files were ever committed (e.g. by accident)
and you want the history to be clean. Pick the tool that matches your
host. Run from the repo root.

> ⚠️ **Rewrites history.** Coordinate with everyone who has a clone.
> Push only after a force-push, and ask collaborators to rebase.

```bash
# 4.1 Find the files to scrub
git log --all --full-history -- \
  docker-compose.infra.yml \
  INFRA.md REVERT.md .env.example \
  nginx scripts secrets \
  .env \
  | awk '/^commit /{c=$2} {print c, $0}' | sort -u
```

Then choose one of:

### `git filter-repo` (recommended)

```bash
git filter-repo --invert-paths \
  --path docker-compose.infra.yml \
  --path INFRA.md \
  --path REVERT.md \
  --path .env.example \
  --path nginx/ \
  --path scripts/ \
  --path secrets/ \
  --path-glob '.env*' \
  --force
```

### `git filter-branch` (built-in, slower)

```bash
git filter-branch --force --index-filter "
  git rm -r --cached --ignore-unmatch \
    docker-compose.infra.yml INFRA.md REVERT.md .env.example \
    nginx scripts secrets .env
" --prune-empty --tag-name-filter cat -- --all
```

After either:

```bash
git reflog expire --expire=now --all
git gc --prune=now --aggressive
git push --force --all
git push --force --tags
```

---

## 5. One-liners

```bash
# Soft stop (keep everything)
docker compose -f docker-compose.infra.yml down

# Stop + delete data
docker compose -f docker-compose.infra.yml down --volumes --remove-orphans

# Full revert (preserves the original docker-compose.yml)
docker compose -f docker-compose.infra.yml down --volumes --remove-orphans \
  && rm -rf .env nginx/certs secrets scripts/redis-acl.conf \
            docker-compose.infra.yml INFRA.md REVERT.md .env.example nginx scripts \
  && echo "221205" | sudo -S rm -rf /etc/nginx/events-fsa /etc/ssl/events-fsa \
  && echo "221205" | sudo -S rm -f  /etc/nginx/modules-enabled/50-mod-stream.conf \
  && echo "221205" | sudo -S sed -i '/^# events-fsa: managed by scripts\/generate-hosts.sh/,/^$/d' /etc/hosts \
  && echo "221205" | sudo -S nginx -t \
  && echo "221205" | sudo -S systemctl reload nginx \
  && git checkout -- .gitignore
```

---

## 6. Troubleshooting a stuck revert

| Symptom | Cause | Fix |
| --- | --- | --- |
| `docker compose down` hangs | A container is in `Restarting` (e.g. bad config) | `docker compose -f docker-compose.infra.yml kill && docker compose -f docker-compose.infra.yml down` |
| `Permission denied` removing `secrets/` | Files written by a different user | `echo "221205" \| sudo -S rm -rf secrets nginx/certs` |
| Volumes still exist after `down --volumes` | Created under the old project name | `docker volume ls \| grep events-fsa` then `docker volume rm <name>` for any leftovers |
| Network still exists | Same as above | `docker network ls \| grep events-fsa` then `docker network rm <name>` |
| `docker compose` complains "no such service" after a partial revert | The compose file is gone but containers are running | `docker ps -a \| grep events-fsa-infra` then `docker rm -f <id>` |
| `.gitignore` shows merge conflicts after `git checkout` | It had uncommitted local changes | Manually re-add the lines that you still need, then `git add .gitignore` |
| `nginx -t` fails after restart with "cannot load certificate" | The cert was deleted but nginx still points at it | Either re-run `scripts/generate-certs.sh` or run the full revert |
| `stream block` still referenced in `/etc/nginx/nginx.conf` after revert | You skipped section 3.4 | Hand-edit `/etc/nginx/nginx.conf` to remove the trailing `stream { ... }` block, then `nginx -t && systemctl reload nginx` |
| `getent hosts postgres` still returns an IP after `/etc/hosts` cleanup | You skipped section 3.5 | `echo "221205" \| sudo -S sed -i '/^# events-fsa: managed by scripts\/generate-hosts.sh/,/^172\.30\./d' /etc/hosts` |

---

## 7. What to keep for future use

If you think you might want to re-enable the infra later, the **minimum**
you need to preserve is:

- `docker-compose.infra.yml`
- `INFRA.md`
- `nginx/` (without `nginx/certs/`)
- `scripts/` (without `scripts/redis-acl.conf` and the generated certs
  under `secrets/`)
- `.env.example`
- The `/etc/nginx/events-fsa/`, `/etc/ssl/events-fsa/`, and
  `/etc/hosts` block references in the docs

Everything else is regenerated by `scripts/bootstrap.sh`.

To freeze a known-good state:

```bash
git add docker-compose.infra.yml INFRA.md nginx scripts .env.example
git commit -m "infra: known-good compose + bootstrap scripts"
```

Then a later revert becomes a single `git revert <commit>` away.
