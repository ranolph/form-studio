# Installation and operation

Form Studio can run with Docker Compose, as a custom Docker-based TrueNAS app, or directly with Python. The application serves its own interface; it does not require a separate web server, Node.js process or database service.

## Docker Compose

Install [Docker Engine](https://docs.docker.com/engine/install/) and [Docker Compose v2](https://docs.docker.com/compose/install/). Download or clone this repository and run the following from the directory containing `compose.yaml`:

```sh
docker compose up -d --build
docker compose ps
```

Visit `http://YOUR-SERVER:8785`. On the same computer, use `http://localhost:8785`.

The first build downloads the Python 3.12 Alpine base image. Subsequent app use does not require internet access. The image is built locally as `form-studio:1.2.0`; these instructions do not depend on a public image registry for the app.

The default Compose configuration runs the app as UID/GID 1000, with a read-only container root filesystem and a writable `/data` named volume. It drops Linux capabilities and provides a temporary `/tmp`. The application has no login, so keep the exposed port on a trusted network.

### Configuration

Copy `.env.example` to `.env` if you want to override the supplied defaults. Compose reads this file; direct Python launch does not.

| Variable | Default | Purpose |
| --- | --- | --- |
| `FORM_STUDIO_PORT` | `8785` | Published port on the Docker host. The container listens on 8080. |
| `BIND_ADDRESS` | `0.0.0.0` | Host interface for the published port. Use `127.0.0.1` for host-only access. |
| `FORM_STUDIO_BED_SIZE` | `256,256,256` | Printer build volume in millimetres, in X,Y,Z order. Each dimension must be positive and at most 2000. |
| `LAYER_LIBRARY_URL` | empty | Initial Layer Library URL, only when creating a new data directory. |
| `APP_UID` / `APP_GID` | `1000` / `1000` | Numeric owner used when building the non-root container user. |

After changes, run:

```sh
docker compose up -d --build
```

Build-volume changes take effect on restart. The volume appears in Settings, the print-bed overlay and the size status. It does not change existing design dimensions. Changing UID/GID requires a rebuild and matching ownership on any existing data.

**The Layer Library URL is different:** it is stored in the SQLite database. The environment value only seeds a new database; change or clear the address through Form Studio's **Settings** after the first start. This keeps app settings intact through container updates.

### Use a bind-mounted data directory

The default named volume is suitable for a straightforward installation. To use a particular dataset or folder, replace the service's `volumes` entry in `compose.yaml` with an absolute path:

```yaml
    volumes:
      - /path/to/form-studio-data:/data
```

Create the folder before starting the app and make it writable by the UID/GID used to build the image. Grant permissions on this app's data folder, including parent-directory traversal, without changing the ownership of an entire shared dataset. Remove the unused top-level named-volume declaration if desired.

## TrueNAS

This route is for TrueNAS installations with **Docker-based Apps (24.10 or later)**. The official [Installing Custom Apps](https://apps.truenas.com/managing-apps/installing-custom-apps/) guide describes **Apps → Discover Apps → Install via YAML**. Older Kubernetes-based TrueNAS Apps need a different deployment method.

The supplied repository Compose file builds from source. For the TrueNAS YAML editor, build the image on the NAS first, then deploy the already-built image using a host-path data mount. Do not run both the command-line Compose stack and the TrueNAS app on the same port.

### 1. Prepare the source and persistent storage

Upload or clone the repository to a dataset you control. Separately create a data directory, for example `/mnt/POOL/apps/form-studio/data`, replacing `POOL` with your own pool name. Keep this data outside the source checkout so replacing the source cannot overwrite designs.

This example uses UID/GID **568:568**. Grant that identity read/write access to the data directory using the TrueNAS permissions/ACL editor, with traversal on parent directories. A different numeric UID/GID is fine if both the image build and dataset permissions use it.

### 2. Build the image

In a TrueNAS shell, change to the uploaded repository directory and run:

```sh
sudo docker build --build-arg APP_UID=568 --build-arg APP_GID=568 -t form-studio:1.2.0 .
```

This installs nothing into the TrueNAS host's Python environment. It creates an app image in Docker's local image store. If Docker's images are later reset, build it again before starting the app.

### 3. Install the custom app

Open **Apps → Discover Apps → Install via YAML**, name the app `form-studio`, and paste the following. Replace the data path before saving:

```yaml
services:
  form-studio:
    image: form-studio:1.2.0
    pull_policy: never
    init: true
    restart: unless-stopped
    ports:
      - "8785:8080"
    environment:
      FORM_STUDIO_BED_SIZE: "256,256,256"
      LAYER_LIBRARY_URL: ""
    volumes:
      - /mnt/POOL/apps/form-studio/data:/data
    read_only: true
    tmpfs:
      - /tmp:rw,nosuid,nodev,size=16777216,mode=1777
    security_opt:
      - no-new-privileges:true
    cap_drop:
      - ALL
    logging:
      driver: json-file
      options:
        max-size: "5m"
        max-file: "3"
```

`pull_policy: never` tells Compose to use the local image and fail if it is missing; it does not try to download an app image. See Docker's [pull policy reference](https://docs.docker.com/reference/compose-file/services/#pull_policy).

Visit `http://YOUR-NAS:8785`. The application health endpoint is `/api/health`, and the Docker image includes a health check.

The repository's `.env` file is not read by this pasted YAML. Change the displayed YAML values in TrueNAS when using this installation route. To upgrade, back up the data, rebuild the image from the new source, then redeploy/recreate the app so it uses the rebuilt image. Set a new image tag in both places when the release version changes.

## Direct Python installation

Use Python 3.12 or newer:

```sh
python3 server.py --host 127.0.0.1 --port 8785 --data ./data --bed-size 220,220,250
```

No `pip install` or `npm install` step is needed. The process runs in the foreground; stop it with Ctrl+C. For a continuously running service, use the operating system's service manager or the Docker deployment.

Available options:

| Option | Environment fallback | Default |
| --- | --- | --- |
| `--host` | `FORM_STUDIO_HOST`, then `HOST` | `0.0.0.0` |
| `--port` | `PORT` | `8080` |
| `--data` | `FORM_STUDIO_DATA`, then `DATA_DIR` | `data/` beside `server.py` |
| `--bed-size` | `FORM_STUDIO_BED_SIZE` | `256,256,256` |
| `--static` | none | `static/` beside `server.py` |

Command-line values take precedence. `LAYER_LIBRARY_URL` has the same first-run-only behavior as in Docker. `.env` is not loaded by `server.py`.

## Connect Layer Library

Layer Library is optional. In Form Studio's **Settings**, enter its base URL, click **Test connection**, then **Save settings**. Leave the URL empty to disable the integration.

For separate Docker stacks or separate TrueNAS apps, the simplest address is the NAS's LAN hostname/IP and Layer Library's published port, for example:

```text
http://your-nas:8777
```

The **Form Studio server** must be able to reach this address. `localhost` inside the Form Studio container refers to that container, not to the NAS or another container. Service names only resolve when both containers share an explicitly configured Docker network; two independent Compose projects do not share a network automatically. On a shared network, the Layer Library Compose service can be reached at `http://layer-library:8080` because it listens on port 8080 inside its container. Its default published host port is 8777.

Use an address reachable by both your browser and Form Studio where possible: the app also uses it for links that open Layer Library. Container-only service names can make transfers work while those browser links fail.

Connection requirements:

- A compatible Layer Library installation in `trusted_lan` mode. The bridge does not sign in to password-protected instances.
- An `http://` or `https://` base URL with no username, password, path, query or fragment.
- A hostname resolving only to permitted private LAN, loopback or Tailscale addresses. Public internet destinations are rejected.
- A reachable `/api/session` endpoint providing Layer Library's session and CSRF token. The bridge handles this session itself.

New models go to the **Form Studio** collection. A duplicate STL can reuse an existing library item; its existing title, notes, tags and collection are preserved. Large editable recipes can exceed Layer Library's 10,000-character notes limit even when the STL upload succeeds. Keep a saved Form Studio design or exported `.form.json` for those recipes.

If a transfer times out after uploading, inspect Layer Library before sending another copy. Form Studio tracks uncertain transfers and prompts before a new upload.

## Data and backups

The data directory contains `form-studio.sqlite3`, and SQLite may also create `-wal` and `-shm` sidecar files. It holds saved designs, trash, settings and export bookkeeping. The browser's working draft lives in that browser's local storage; save the design to include it in server backups.

For a Compose named volume, stop the app and copy the complete data directory to a new backup folder:

```sh
docker compose stop form-studio
docker compose cp form-studio:/data ./form-studio-backup
docker compose start form-studio
```

Choose a new destination name for each backup. For a bind mount or TrueNAS dataset, stop the app, then copy or snapshot that complete data directory before starting it again. Copying a live SQLite database file by itself can miss changes in its WAL file.

To restore, stop the app, retain a copy of the current data, and replace the complete data directory with the backup. Restore the configured UID/GID's permissions before starting. A `.form.json` recipe provides a second way to move individual editable designs between installations.

## Updates and everyday commands

Back up data, update the source checkout or replace it with a new release, then rebuild and recreate the Compose service:

```sh
docker compose up -d --build
```

Keep using the same Compose project/directory name to retain the same named volume. Rebuilds and ordinary container recreation preserve the named volume. `docker compose down -v` removes it and its data.

Useful commands:

```sh
docker compose logs --tail=100 form-studio
docker compose ps
docker compose stop
docker compose start
```

The application is served from the site root. A reverse proxy should forward the original host and serve it at `/`; subpath hosting such as `/form-studio/` is not supported. Form Studio has no built-in authentication; any external-access arrangement needs appropriate access control outside the app. See [Security](../SECURITY.md).

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Port 8785 is already in use | Change `FORM_STUDIO_PORT` in `.env`, or the left side of the TrueNAS port mapping. |
| Container exits with a data-folder or SQLite permission error | Ensure the mounted directory and its parents permit access by the image's UID/GID. Rebuilding with new IDs does not change existing volume ownership. |
| TrueNAS cannot find the image | Build `form-studio:1.2.0` on that NAS first. Confirm the YAML tag matches the tag you built. |
| Layer Library connection fails | Use a server-reachable base URL, confirm the port and `trusted_lan` mode, and check Docker networking/DNS. A browser reaching a URL does not prove the server can reach it. |
| Changing `LAYER_LIBRARY_URL` has no effect | A saved database setting takes precedence after first start. Change it in the app's Settings. |
| Preview looks soft | Set **Preview sharpness** to High or Ultra. For more geometric detail, also increase mesh preview quality; these are separate controls. |
| Preview is slow | Reduce preview sharpness/detail, use fewer dense effects, or try a browser with hardware acceleration. The software fallback can be slower on large meshes. |
| Old interface appears after an update | Hard-refresh the browser after the new container starts. Your saved data stays in the mounted data directory. |
| Model exceeds the configured build volume | Resize it, change the build-volume setting to match your printer, or plan a different orientation/split in your slicer. |
