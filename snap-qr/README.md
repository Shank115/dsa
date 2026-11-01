# Snap QR

See **PROJECT.md** for the full story: why it exists, decisions, and next steps.

Scan a QR -> landing page with "Add me on Snapchat" + the Stack Tower game. Every scan/visit is counted.

## Run locally
    pip install "qrcode[pil]"
    python server.py          # serves site/ on port 8000 and records stats
    python make_qr.py         # writes qr.png pointing at this PC's LAN address

Scan qr.png with a phone on the same Wi-Fi. Stats: http://localhost:8000/stats.html

## Memes
Drop screenshots into `meme/`, then run `python make_memes.py`. Run it again whenever you add more.

## Customise
Edit `site/js/config.js` (name, Snapchat username, tagline, avatar image).

## Files
- `site/` - the website (index.html, stats.html, css, js). This folder is what gets deployed.
- `server.py` - local server + analytics API (`POST /api/track`, `GET /api/stats`), data in `data/stats.json`.
- `make_qr.py` - styled QR generator. `python make_qr.py https://your-site.netlify.app` once live.
