# Wear Right - Windows setup guide (beginner friendly)

This guide is for a Windows 10 or Windows 11 computer. It uses normal PowerShell, not WSL. The same steps work on the laptop brought to the demo.

> **Use the Node commands in this guide.**
> `run-prod.sh`, `run-build.sh`, `make` and other shell scripts are for Linux/macOS. They do **not** work in normal Windows PowerShell. The Node task runner does the same jobs on Windows.

## The only commands you normally need

Run every command in the project folder, for example `C:\dev\Wear-Right`.

| What you want | Windows command |
| --- | --- |
| **First-time setup** | `npm run setup` |
| **Start the demo** | `npm run run-prod` |
| Rebuild the website | `npm run build` |
| Re-seed demo data | `npm run seed` |
| Download missing AI models | `npm run models` |
| Start the database | `npm run db:up` |
| Stop the database | `npm run db:down` |
| Erase the database | `npm run db:reset` |
| Full demo (seed + build + run) | `npm run demo` |
| Development mode | `npm run dev` |

`npm run setup` installs everything and prepares the database. `npm run run-prod` starts the built demo and stops old project servers on ports 3000 and 8000. Press **Ctrl + C** to stop the website and backend; Docker keeps running.

## 1. Install these once

Open each download page and use the normal installer. After installing, **close PowerShell and open it again** so Windows sees the new commands.

| Program | Where to get it | What to check |
| --- | --- | --- |
| Git | <https://git-scm.com/download/win> | `git --version` |
| Python 3.12 | <https://www.python.org/downloads/windows/> | Tick **Add python.exe to PATH**. Check `py -3.12 --version`. |
| Node.js LTS (20.9 or newer) | <https://nodejs.org/> | `node --version` and `npm --version` |
| Docker Desktop | <https://www.docker.com/products/docker-desktop/> | Start it and wait for **Running**. Check `docker --version` and `docker compose version`. |

Docker Desktop may ask to enable WSL2. Allow it; Docker needs that internally. You still run every project command in normal PowerShell.

> Put the project in a short folder such as `C:\dev\Wear-Right`. Do not put it inside OneDrive; syncing thousands of `node_modules` files slows everything down.

## 2. Download the project

Right-click the folder where you want it, choose **Open in Terminal**, then run:

```powershell
git clone <repository-url> Wear-Right
cd Wear-Right
```

## 3. The two commands

Run these from the project folder.

### First-time setup

```powershell
npm run setup
```

This one command:

- creates the Python environment and `apps\server\.env` with a random secret key;
- installs the Python and Node packages;
- starts Postgres and Mailpit in Docker;
- applies the database migrations;
- creates the demo products, photos, prices, stock, categories, tone rules and logins;
- downloads any missing AI models (the first run is large);
- imports and publishes the mannequin kit when it is present;
- creates the fast production website build.

You only need it once, or again after pulling new code/dependencies.

### Start the demo

```powershell
npm run run-prod
```

This starts Docker if needed, applies migrations, and starts the production website and backend. Open:

**<http://localhost:3000>**

Press **Ctrl + C** in that window to stop the website and backend. To stop the database containers:

```powershell
npm run db:down
```

`npm run run-prod` uses the existing build, so it is fast. Run `npm run build` after changing frontend code, or `npm run setup` again if anything is unclear.

### If you want every step separately

```powershell
npm run build       # production website build
npm run seed        # database, demo data and mannequin
npm run models      # download missing AI models
npm run db:up       # start only Postgres and Mailpit
```

## Demo logins

| Who | Page | Email | Password |
| --- | --- | --- | --- |
| Customer | `/login` | demo@wearright.local | demo12345 |
| Admin | `/admin/login` | admin@wearright.com | admin123 |

Admin and customer accounts are separate. The demo emails appear at <http://localhost:8025>.

## Mannequin data

The mannequin kit is not in Git because the images are large. Put the provided folder here:

```text
Wear-Right\
  extras\
    mannequin-alpha-kit\
      manifest.csv
      base\men.png
      base\women.png
      renders\...
```

`seed` finds that folder automatically. If the kit is somewhere else:

```powershell
npm run seed -- --mannequin-kit "D:\assets\mannequin-alpha-kit"
```

Only rows marked `done` in `manifest.csv` are imported. The kit references products that must already exist in the database. On this demo machine they do. On a completely empty database, import the product catalogue first or restore a database backup; otherwise the mannequin rows are skipped with a message.

To skip the mannequin even when the kit exists:

```powershell
npm run seed -- --skip-mannequin
```

## Every day

```powershell
npm run dev
```

This starts Docker and runs the development website and backend with live reload. Open <http://localhost:3000>.

## Helpful commands

| Command | What it does |
| --- | --- |
| `npm run setup` | Complete first-time setup |
| `npm run run-prod` | Start the production demo |
| `npm run build` | Rebuild the production website |
| `npm run seed` | Re-seed database and mannequin data |
| `npm run models` | Download missing AI models |
| `npm run db:up` | Start Postgres and Mailpit |
| `npm run db:down` | Stop the containers, keep the data |
| `npm run db:reset` | Delete the database volume and start empty |
| `npm run test` | Run the backend and website tests |
| `npm run doctor` | Show what is installed and what is missing |
| `npm run demo` | Full seed + build + run path |

After `db:reset`, run `npm run setup` again.

## If something goes wrong

**"python is not recognized" or the Microsoft Store opens.**
Install Python 3.12 from python.org and tick **Add python.exe to PATH**, or use the `py` launcher. Check `py -3.12 --version`, then open a new PowerShell window.

**"node" or "npm" is not recognized.**
Install Node.js LTS, close PowerShell, open it again, and run `node --version`.

**Docker says it cannot connect.**
Start Docker Desktop and wait until it says **Running**. Check `docker --version` and `docker compose version`.

**Port 5433 is already in use.**
Another database is using it. Stop the other program, or change the port in `docker-compose.yml` and `apps\server\.env` together.

**"That port is already in use" or "Django failed to start".**
An older demo window left a server running. The Node `demo` command now stops old servers on ports 3000 and 8000 automatically. If it still happens, open PowerShell as Administrator and check which program owns the port:

```powershell
netstat -ano | findstr :3000
netstat -ano | findstr :8000
```

The last number is the PID. Stop it (replace `1234`):

```powershell
taskkill /PID 1234 /T /F
```

Then run `npm run run-prod` again.

**"connection to server at localhost port 5433 failed" or the website shows database errors.**
Docker was stopped. Start it and wait until Docker Desktop says **Running**, then:

```powershell
npm run db:up
npm run run-prod
```

**I closed the window and now the site is broken.**
Just run `npm run run-prod` again. It starts Docker first, so the database comes back with the website.

**The website is empty.**
Run `npm run seed`, then reload the page.

**Product photos are missing.**
Check `MEDIA_ROOT` in `apps\server\.env`, then run `seed` again or restore the media backup.

**The camera does not open.**
Use `http://localhost:3000`, not a network address. Allow camera access in Windows and in the browser. You can always upload a photo or pick the skin tone manually.

**The build stops with a security warning.**
Use Node.js LTS and run `npm run setup` again. The package lock installs the tested Next.js version.

## What "production demo" means

`demo` is a production-style **local** demo: the website is built once and served with `next start`, and Django runs without the development reloader. It is not a public website. For a real public deployment you still need HTTPS, a proper web server, secure cookies and a real email provider.
