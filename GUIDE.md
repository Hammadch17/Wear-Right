# Wear Right - complete beginner guide

This is the only guide you need to run Wear Right on Windows, macOS or Linux.

> **Windows users:** do **not** run `run-prod.sh`, `run-build.sh`, `make`, or any `./something.sh` command in PowerShell. Those are Linux/macOS scripts. Use the `npm run ...` commands below; they work on every operating system.

---

## 1. Install these three programs once

1. **Node.js 20.9 or newer** - <https://nodejs.org> (choose the LTS installer).
2. **Python 3.12** - <https://www.python.org/downloads/>
   - On Windows, tick **Add python.exe to PATH** during installation.
3. **Docker Desktop** - <https://www.docker.com/products/docker-desktop/>
   - Start Docker Desktop and wait until it says **Running**.

You do **not** need WSL, Git Bash, Make, or any shell scripting tool.

Open a terminal in the project folder (the folder that contains `package.json`).
On Windows you can type `cmd` in the folder's address bar and press Enter.

---

## 2. First-time setup: one command

```bash
npm run setup
```

This one command does all of the following, in order:

- creates the Python environment at `apps/server/venv`;
- creates `apps/server/.env` with a random secret key if it is missing;
- installs the Python and Node packages;
- starts the PostgreSQL and Mailpit Docker containers;
- runs all database migrations;
- seeds products, categories, colours, tone rules, and demo logins;
- downloads any missing AI models (face scanner, gender suggestion, background removal);
- imports and publishes the mannequin kit from `extras/mannequin-alpha-kit` when present;
- creates the production website build.

The first run downloads several hundred MB of AI models and can take a few minutes.
Later runs skip downloads that are already present.

When it finishes you will see:

```text
Setup finished.

Start the demo with:
  npm run run-prod
```

---

## 3. Start the demo

```bash
npm run run-prod
```

Wait for:

```text
Ready in ... ms
Starting development server at http://127.0.0.1:8000/
```

Then open:

- **Website:** <http://localhost:3000>
- **Admin:** <http://localhost:3000/admin/login>
- **Mailpit (test emails):** <http://localhost:8025>

Press **Ctrl + C** in the terminal to stop the website and backend.
The database containers stay running, which makes the next start faster.

---

## 4. Demo logins

These are created by the seed step when `DEBUG=True`:

| Role | Email / username | Password |
| --- | --- | --- |
| Customer | `demo@wearright.local` | `demo12345` |
| Admin | `admin@wearright.com` | `admin123` |
| Legacy admin | `admin` | `admin12345` |

The admin password shown by the production demo is `admin12345`.

---

## 5. Everyday commands

| Task | Command |
| --- | --- |
| **First-time setup** | `npm run setup` |
| **Start the demo** | `npm run run-prod` |
| Rebuild the website | `npm run build` |
| Re-seed demo data | `npm run seed` |
| Download missing AI models | `npm run models` |
| Start the database only | `npm run db:up` |
| Stop the database | `npm run db:down` |
| Erase the database and start fresh | `npm run db:reset` |
| Development mode with hot reload | `npm run dev` |
| Run all tests | `npm run test` |
| Check what is installed | `npm run doctor` |
| Full demo (seed + build + run) | `npm run demo` |

`npm run run-prod` does **not** rebuild or re-seed. It starts the existing production build, so it is fast. Run `npm run build` after changing frontend code, or `npm run setup` again when in doubt.

---

## 6. What to do when something goes wrong

### "That port is already in use" or "Django failed to start"

An old demo window is still running. `npm run run-prod` normally stops old project servers on ports 3000 and 8000 automatically. If it still fails, open PowerShell as Administrator:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

The last number is the process ID (PID). Stop it (replace `1234`):

```powershell
taskkill /PID 1234 /T /F
```

Then run `npm run run-prod` again.

### "connection to server at localhost port 5433 failed"

Docker is not running. Start Docker Desktop, wait for **Running**, then:

```bash
npm run db:up
npm run run-prod
```

### The website opens but product photos are missing

The shared media folder is not configured. Check `apps/server/.env` contains a valid `MEDIA_ROOT`, then run:

```bash
npm run seed
```

The seed command restores photos it can find in `apps/server/seed_media` and reports any that are still missing.

### The face scan works but the gender suggestion asks every time

The optional gender model is missing. Download it:

```bash
npm run models
```

Restart the demo afterwards.

### I closed the terminal and now the site is broken

The servers stopped with the terminal. Start them again:

```bash
npm run run-prod
```

### I want to start over with a clean database

```bash
npm run db:reset
npm run setup
```

This erases all database data.

---

## 7. What is stored where

- **Database:** Docker container `wearright-db`, port `5433`.
- **Product photos and mannequin images:** the folder in `MEDIA_ROOT` (normally `/home/jb/wear-right-data/media` on this machine, or `apps/server/media`).
- **AI models:** `apps/server/ml_models` (downloadable, not in git).
- **Production website build:** `apps/web/.next`.
- **Backend configuration:** `apps/server/.env`.

Do not delete `MEDIA_ROOT` or `ml_models` unless you know how to restore them.
