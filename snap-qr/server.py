"""Local server: serves site/ and records visit analytics in data/stats.json.

Run:   python server.py
Then open the printed URLs. Phones on the same Wi-Fi can use the LAN address.
"""
import json
import re
import secrets
import socket
import threading
import time
import unicodedata
from datetime import datetime
from functools import cache, partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
mimetypes.add_type("font/woff2", ".woff2")  # Windows Python doesn't know it
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

ROOT = Path(__file__).parent
SITE = ROOT / "site"
DATA = ROOT / "data" / "stats.json"
BOARD = ROOT / "data" / "leaderboard.json"
BOARDS = {"stack": BOARD, "hit": ROOT / "data" / "leaderboard_hit.json"}  # one leaderboard per game
MESSAGES = ROOT / "data" / "messages.json"
AURA = ROOT / "data" / "aura.json"
OWNER_KEY_FILE = ROOT / "data" / "owner_key.txt"
PORT = 8000
EVENTS = {"visit", "snap_click", "game_start", "game_over", "share",
          "meme_open", "meme_session", "meme_like", "meme_unlike", "meme_share", "meme_react"}
MEME_ID = re.compile(r"[0-9a-f]{12}")
MAX_REACTIONS_PER_MEME = 60  # different emojis on one meme, so it can't be spammed
MAX_SCORE = 2000

lock = threading.Lock()
message_times = {}  # ip -> recent send times, for a simple rate limit
presence = {}       # vid -> last ping time ("people vibing here rn"), memory only
ONLINE_WINDOW = 45  # seconds since last ping to count as online

# Aura titles: (minimum aura, title)
TITLES = [(0, "NPC 😐"), (500, "Side character 🙂"), (1500, "Rising star ⭐"), (3000, "Main character 💅"),
          (6000, "Aura farmer 🌾"), (10000, "Sigma 🗿"), (20000, "GOAT 🐐")]


@cache
def owner_key():
    """Secret that marks your own scores as the owner's ("Beat my score")."""
    try:
        return OWNER_KEY_FILE.read_text().strip()
    except FileNotFoundError:
        key = secrets.token_urlsafe(9)
        OWNER_KEY_FILE.parent.mkdir(exist_ok=True)
        OWNER_KEY_FILE.write_text(key)
        return key


def empty_stats():
    return {
        "totals": {
            "visits": 0, "qr_scans": 0, "unique_visitors": 0,
            "snap_clicks": 0, "game_starts": 0, "games_finished": 0, "shares": 0,
        },
        "best_score": 0,
        "daily": {},
        "visitors": {},
        "recent": [],
    }


def load(path=DATA, default=empty_stats):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, ValueError):
        return default()


def save(data, path=DATA):
    path.parent.mkdir(exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data, indent=1), encoding="utf-8")
    tmp.replace(path)


def device(ua):
    for key, name in (("iPhone", "iPhone"), ("iPad", "iPad"), ("Android", "Android"),
                      ("Windows", "Windows"), ("Mac OS", "Mac")):
        if key in ua:
            return name
    return "Other"


def record(event, payload, ua):
    now = datetime.now()
    day = now.strftime("%Y-%m-%d")
    vid = str(payload.get("vid", ""))[:64]
    with lock:
        s = load()
        t = s["totals"]
        d = s["daily"].setdefault(day, {"visits": 0, "qr_scans": 0, "new_visitors": 0, "snap_clicks": 0, "games": 0})
        entry = {"t": now.isoformat(timespec="seconds"), "event": event, "device": device(ua)}

        if event == "visit":
            src = "qr" if payload.get("src") == "qr" else "direct"
            entry["src"] = src
            t["visits"] += 1
            d["visits"] += 1
            if src == "qr":
                t["qr_scans"] += 1
                d["qr_scans"] += 1
            if vid and vid not in s["visitors"]:
                s["visitors"][vid] = entry["t"]
                t["unique_visitors"] += 1
                d["new_visitors"] += 1
        elif event == "snap_click":
            t["snap_clicks"] += 1
            d["snap_clicks"] += 1
        elif event == "game_start":
            entry["game"] = game_of(payload)
            t["game_starts"] += 1
            d["games"] += 1
        elif event == "game_over":
            game = entry["game"] = game_of(payload)
            score = max(0, min(int(payload.get("score") or 0), 100000))
            entry["score"] = score
            t["games_finished"] += 1
            key = "best_score" if game == "stack" else f"best_score_{game}"
            s[key] = max(s.get(key, 0), score)
        elif event == "share":
            t["shares"] += 1
        elif event.startswith("meme_"):
            if not record_meme(s, t, event, payload, entry):
                save(s)
                return None

        s["recent"].insert(0, entry)
        del s["recent"][40:]
        save(s)
        return award_aura(vid, event, payload, day) if vid else None


def is_emoji(text):
    """One emoji (any, incl. skin tones, combos, flags) - no letters, digits, spaces or junk."""
    if not 0 < len(text) <= 12:
        return False
    cats = [unicodedata.category(ch) for ch in text]
    if not all(c in ("So", "Sk", "Mn", "Me", "Cf") for c in cats):
        return False
    if len(text) == 2 and all(0x1F1E6 <= ord(ch) <= 0x1F1FF for ch in text):
        return True  # a flag is two regional-indicator letters
    # exactly one base symbol; others must be joined to it with a zero-width joiner (e.g. 😮‍💨, 👨‍👩‍👧)
    bases = [i for i, c in enumerate(cats) if c == "So" and (i == 0 or text[i - 1] != "‍")]
    return len(bases) == 1


def record_meme(s, t, event, payload, entry):
    """Meme scroll counters. Returns False for events that shouldn't show in recent activity."""
    for key in ("meme_opens", "memes_viewed", "meme_likes", "meme_shares", "meme_reactions"):
        t.setdefault(key, 0)
    likes = s.setdefault("meme_likes", {})
    mid = str(payload.get("id", ""))
    if event == "meme_open":
        t["meme_opens"] += 1
        return True
    if event == "meme_session":
        count = max(0, min(int(payload.get("count") or 0), 5000))
        t["memes_viewed"] += count
        entry["count"] = count
        return count > 0
    if not MEME_ID.fullmatch(mid):
        return False
    if event == "meme_like":
        likes[mid] = likes.get(mid, 0) + 1
        t["meme_likes"] += 1
        return True
    if event == "meme_react":
        # One reaction per phone per meme: `prev` is taken back, `emoji` (if any) is added.
        emoji, prev = str(payload.get("emoji", "")), str(payload.get("prev", ""))
        if (emoji and not is_emoji(emoji)) or (prev and not is_emoji(prev)):
            return False
        r = s.setdefault("meme_reaction_counts", {}).setdefault(mid, {})
        if emoji and not r.get(emoji) and sum(1 for n in r.values() if n > 0) >= MAX_REACTIONS_PER_MEME:
            return False
        if prev and r.get(prev, 0) > 0:
            r[prev] -= 1
            t["meme_reactions"] = max(0, t["meme_reactions"] - 1)
        if emoji:
            r[emoji] = r.get(emoji, 0) + 1
            t["meme_reactions"] += 1
            entry["emoji"] = emoji
        return bool(emoji)
    if event == "meme_unlike" and likes.get(mid, 0) > 0:
        likes[mid] -= 1
        t["meme_likes"] = max(0, t["meme_likes"] - 1)
    elif event == "meme_share":
        t["meme_shares"] += 1
        return True
    return False


# ---------- Aura points (Gen Z XP for doing things on the page) ----------

def title_for(points):
    i = max(i for i, (need, _) in enumerate(TITLES) if points >= need)
    nxt = TITLES[i + 1] if i + 1 < len(TITLES) else None
    return TITLES[i][1], ({"title": nxt[1], "need": nxt[0], "from": TITLES[i][0]} if nxt else None)


def award_aura(vid, event, payload, day):
    """Aura for an action, with one-time and daily limits. Call with `lock` held."""
    auras = load(AURA, dict)
    a = auras.setdefault(vid, {"aura": 0})
    pts, reasons = 0, []
    if event == "visit":
        if a.get("visit_day") != day:
            a["visit_day"] = day
            pts += 50
            reasons.append("daily check-in")
        if payload.get("src") == "qr" and not a.get("qr"):
            a["qr"] = True
            pts += 100
            reasons.append("scanned the QR")
    elif event == "share":
        if a.get("share_day") != day:
            a["share_day"], a["shares"] = day, 0
        if a["shares"] < 3:
            a["shares"] += 1
            pts, reasons = 200, ["challenged a friend"]
    elif event == "game_over" and game_of(payload) == "hit":
        score = max(0, min(int(payload.get("score") or 0), MAX_SCORE))
        pts = score * 12 if score else -50
        reasons = ["missed the very first knife 💀"] if score == 0 else [f"hit {score} in Knife Hit"]
    elif event == "game_over":
        score = max(0, min(int(payload.get("score") or 0), MAX_SCORE))
        perfects = max(0, min(int(payload.get("perfects") or 0), score))
        pts = score * 15 + perfects * 40 if score else -50
        reasons = ["fumbled the first block 💀"] if score == 0 else [f"stacked {score}" + (f", {perfects} perfect" if perfects else "")]
    if not pts:
        return None
    a["aura"] = max(0, a["aura"] + pts)
    save(auras, AURA)
    title, _ = title_for(a["aura"])
    return {"aura": pts, "reason": " + ".join(reasons), "total": a["aura"], "title": title}


def aura_view(vid=""):
    with lock:
        auras = load(AURA, dict)
        names = {v: e["name"] for path in BOARDS.values() for v, e in load(path, dict).items()}
    rows = sorted(((v, a["aura"]) for v, a in auras.items() if a["aura"] > 0), key=lambda r: -r[1])
    top = [{"name": names.get(v) or f"anon #{v[:4]}", "aura": pts, "title": title_for(pts)[0], "you": v == vid}
           for v, pts in rows[:10]]
    mine = auras.get(vid, {}).get("aura", 0)
    title, nxt = title_for(mine)
    rank = next((i + 1 for i, (v, _) in enumerate(rows) if v == vid), None)
    return {"top": top, "players": len(rows), "you": {"aura": mine, "title": title, "next": nxt, "rank": rank}}


def ping(vid):
    now = time.time()
    with lock:
        if vid:
            presence[vid] = now
        for v in [v for v, t in presence.items() if now - t > ONLINE_WINDOW]:
            del presence[v]
        return len(presence)


# ---------- Leaderboard (one entry per player, keeps their best) ----------

def clean_name(raw):
    name = "".join(ch for ch in str(raw) if ch.isprintable())
    return " ".join(name.split())[:16]


def board_view(board, vid=""):
    rows = sorted(board.values(), key=lambda e: (-e["score"], e["t"]))
    top = [{"name": e["name"], "score": e["score"], "owner": e["owner"], "you": e["vid"] == vid} for e in rows[:10]]
    you = next(({"rank": i + 1, "name": e["name"], "score": e["score"]}
                for i, e in enumerate(rows) if e["vid"] == vid), None)
    owner = next(({"name": e["name"], "score": e["score"]} for e in rows if e["owner"]), None)
    return {"top": top, "you": you, "owner": owner, "players": len(rows)}


def game_of(payload):
    """Which game an event or score is for (older clients only had Stack Tower)."""
    game = str(payload.get("game") or "stack")
    return game if game in BOARDS else "stack"


def submit_score(payload):
    path = BOARDS[game_of(payload)]
    vid = str(payload.get("vid", ""))[:64]
    name = clean_name(payload.get("name", ""))
    score = int(payload.get("score"))
    if not vid or not name or not 0 < score <= MAX_SCORE:
        raise ValueError
    is_owner = secrets.compare_digest(str(payload.get("ownerKey") or ""), owner_key())
    with lock:
        board = load(path, dict)
        e = board.get(vid)
        if e is None or score > e["score"]:
            board[vid] = {"vid": vid, "name": name, "score": score,
                          "t": datetime.now().isoformat(timespec="seconds"),
                          "owner": is_owner or bool(e and e["owner"])}
        else:
            e["name"] = name
            e["owner"] = e["owner"] or is_owner
        save(board, path)
        return board_view(board, vid)


# ---------- Anonymous messages (only readable with the owner key) ----------

def submit_message(payload, ip):
    raw = str(payload.get("text", ""))
    text = "".join(ch for ch in raw if ch.isprintable() or ch == "\n").strip()[:300]
    if not text:
        raise ValueError
    now = time.time()
    with lock:
        recent = [t for t in message_times.get(ip, []) if now - t < 600]
        if len(recent) >= 5:
            raise PermissionError
        message_times[ip] = recent + [now]
        msgs = load(MESSAGES, list)
        msgs.insert(0, {"t": datetime.now().isoformat(timespec="seconds"), "text": text})
        save(msgs, MESSAGES)


class Handler(SimpleHTTPRequestHandler):
    def end_headers(self):
        # Meme images never change (named by content), so phones can keep them for scrolling back
        # without signal. Everything else is always served fresh while testing.
        immutable = (self.path.startswith("/memes/") and self.path.endswith(".webp")) or self.path.startswith("/fonts/")
        self.send_header("Cache-Control", "public, max-age=31536000, immutable" if immutable else "no-store")
        super().end_headers()

    def send_json(self, data):
        body = json.dumps(data).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path not in ("/api/track", "/api/score", "/api/message", "/api/ping"):
            return self.send_error(404)
        length = min(int(self.headers.get("Content-Length") or 0), 2048)
        try:
            payload = json.loads(self.rfile.read(length) or b"{}")
            if not isinstance(payload, dict):
                raise ValueError
            if self.path == "/api/ping":
                return self.send_json({"online": ping(str(payload.get("vid", ""))[:64])})
            if self.path == "/api/score":
                return self.send_json(submit_score(payload))
            if self.path == "/api/message":
                submit_message(payload, self.client_address[0])
                self.send_response(204)
                return self.end_headers()
            if payload.get("event") not in EVENTS:
                raise ValueError
            earned = record(payload["event"], payload, self.headers.get("User-Agent", ""))
            if earned:
                return self.send_json(earned)
        except PermissionError:
            return self.send_error(429)
        except (ValueError, TypeError):
            return self.send_error(400)
        self.send_response(204)
        self.end_headers()

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/stats":
            with lock:
                s = load()
                s["leaderboard"] = board_view(load(BOARD, dict))
                s["leaderboard_hit"] = board_view(load(BOARDS["hit"], dict))
                s["messages_count"] = len(load(MESSAGES, list))
            s["online"] = ping("")
            s.pop("visitors", None)
            return self.send_json(s)
        if url.path == "/api/messages":
            key = parse_qs(url.query).get("key", [""])[0]
            if not secrets.compare_digest(key, owner_key()):
                return self.send_error(403)
            with lock:
                return self.send_json(load(MESSAGES, list))
        if url.path == "/api/meme-reactions":
            with lock:
                return self.send_json(load().get("meme_reaction_counts", {}))
        if url.path == "/api/aura":
            return self.send_json(aura_view(parse_qs(url.query).get("vid", [""])[0][:64]))
        if url.path == "/api/leaderboard":
            q = parse_qs(url.query)
            vid = q.get("vid", [""])[0]
            path = BOARDS[game_of({"game": q.get("game", [""])[0]})]
            with lock:
                return self.send_json(board_view(load(path, dict), vid))
        super().do_GET()

    def log_message(self, fmt, *args):
        if "/api/" not in self.path:
            super().log_message(fmt, *args)


def lan_ip():
    """This PC's address on the local network (no traffic is actually sent)."""
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            sock.connect(("10.255.255.255", 1))
            return sock.getsockname()[0]
        except OSError:
            return "127.0.0.1"


if __name__ == "__main__":
    server = ThreadingHTTPServer(("0.0.0.0", PORT), partial(Handler, directory=str(SITE)))
    ip = lan_ip()
    print(f"\n  Site (this PC):   http://localhost:{PORT}")
    print(f"  Site (phone):     http://{ip}:{PORT}/?src=qr")
    print(f"  Stats + messages: http://localhost:{PORT}/stats.html?key={owner_key()}")
    print(f"\n  Owner link (open ONCE on your own phone so your scores get the crown):")
    print(f"                    http://{ip}:{PORT}/?owner={owner_key()}")
    print(f"\n  Make a QR for your phone:  python make_qr.py\n  Ctrl+C to stop.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
