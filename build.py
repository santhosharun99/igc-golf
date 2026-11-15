"""Inline images into src.html -> index.html (single self-contained page)."""
import base64, os
H = os.path.dirname(os.path.abspath(__file__))
uri = lambda p: "data:image/jpeg;base64," + base64.b64encode(open(os.path.join(H, p), "rb").read()).decode()
s = open(os.path.join(H, "src.html"), encoding="utf-8").read()
open(os.path.join(H, "app.html"), "w", encoding="utf-8").write(s.replace("__BANNER__", uri("banner.jpg")))
