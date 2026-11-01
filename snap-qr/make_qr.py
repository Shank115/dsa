"""Generate a styled QR code (qr.png) that opens the site.

Usage:
  python make_qr.py                             # this PC's LAN address, for testing on your phone
  python make_qr.py https://yourname.netlify.app # the live site, once deployed

"?src=qr" is added so scans are counted separately from normal visits.
Needs:  pip install "qrcode[pil]"
"""
import sys
from urllib.parse import urlsplit, urlunsplit

import qrcode
from qrcode.image.styledpil import StyledPilImage
from qrcode.image.styles.colormasks import VerticalGradiantColorMask
from qrcode.image.styles.moduledrawers import RoundedModuleDrawer

from server import PORT, lan_ip


def with_src(url):
    parts = urlsplit(url)
    query = parts.query
    if "src=" not in query:
        query = f"{query}&src=qr" if query else "src=qr"
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "/", query, parts.fragment))


def main():
    url = with_src(sys.argv[1] if len(sys.argv) > 1 else f"http://{lan_ip()}:{PORT}/")
    qr = qrcode.QRCode(error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=16, border=3)
    qr.add_data(url)
    img = qr.make_image(
        image_factory=StyledPilImage,
        module_drawer=RoundedModuleDrawer(),
        color_mask=VerticalGradiantColorMask(
            back_color=(255, 255, 255), top_color=(124, 58, 237), bottom_color=(236, 72, 153)
        ),
    )
    img.save("qr.png")
    print(f"Saved qr.png  ->  {url}")


if __name__ == "__main__":
    main()
