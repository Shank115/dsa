"""Prepares memes for the site's meme scroll.

Put screenshots (jpg/png/webp, any names) in meme/, then run:
    python make_memes.py

Each meme is resized to 720px wide, saved as WebP in site/memes/ (photo metadata such as
location is not copied), duplicates are skipped, and site/memes/memes.json lists them all.
Run it again whenever you add or remove memes.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).parent
SRC = ROOT / "meme"
OUT = ROOT / "site" / "memes"
WIDTH = 720
QUALITY = 74
TYPES = {".jpg", ".jpeg", ".png", ".webp"}


def dhash(im):
    """64-bit difference hash: near-identical images (re-saved, resized) get close hashes."""
    g = im.convert("L").resize((9, 8), Image.LANCZOS)
    px = list(g.getdata())
    return sum(1 << i for i in range(64) if px[(i // 8) * 9 + i % 8] > px[(i // 8) * 9 + i % 8 + 1])


def main():
    if not SRC.is_dir():
        sys.exit(f"Put your meme screenshots in {SRC} first.")
    OUT.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in TYPES)
    items, seen, dupes, broken = [], [], 0, []

    for path in files:
        try:
            with Image.open(path) as raw:
                im = ImageOps.exif_transpose(raw).convert("RGB")
        except OSError:
            broken.append(path.name)
            continue
        h = dhash(im)
        if any(bin(h ^ other).count("1") <= 4 for other in seen):
            dupes += 1
            continue
        seen.append(h)
        if im.width > WIDTH:
            im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
        mid = hashlib.sha1(im.tobytes()).hexdigest()[:12]
        target = OUT / f"{mid}.webp"
        if not target.exists():
            im.save(target, "WEBP", quality=QUALITY, method=6)  # no exif= so metadata is dropped
        items.append({"id": mid, "w": im.width, "h": im.height})

    keep = {f"{m['id']}.webp" for m in items}
    removed = 0
    for old in OUT.glob("*.webp"):
        if old.name not in keep:
            old.unlink()
            removed += 1
    (OUT / "memes.json").write_text(json.dumps({"count": len(items), "items": items}, separators=(",", ":")))

    size = sum((OUT / name).stat().st_size for name in keep)
    print(f"  {len(items)} memes ready in site/memes/ ({size / 1e6:.1f} MB, avg {size / max(1, len(items)) / 1024:.0f} KB)")
    if dupes:
        print(f"  {dupes} duplicate(s) skipped")
    if removed:
        print(f"  {removed} old meme(s) removed")
    if broken:
        print(f"  Couldn't read: {', '.join(broken)}")


if __name__ == "__main__":
    main()
