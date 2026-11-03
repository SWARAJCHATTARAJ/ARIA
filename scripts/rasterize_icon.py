import fitz
from PIL import Image
import io, os

SRC = "frontend/public/aria-icon.svg"
OUT_DIR = "assets"
os.makedirs(OUT_DIR, exist_ok=True)

# Render SVG at 1024x1024
doc = fitz.open(SRC)
page = doc[0]
# Target size 1024 px on 120 pt viewBox -> zoom = 1024 / 120 (use full-bleed rect)
target = 1024
zoom = target / page.rect.width
pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
img = Image.open(io.BytesIO(pix.tobytes("png"))).convert("RGBA")
print("rendered:", img.size)

if img.size != (target, target):
    img = img.resize((target, target), Image.LANCZOS)

# Composite on #050505 obsidian background
bg = Image.new("RGBA", (target, target), (5, 5, 5, 255))
bg.alpha_composite(img)
flat = bg.convert("RGB")

flat.save(os.path.join(OUT_DIR, "logo.png"), "PNG")
flat.save(os.path.join(OUT_DIR, "icon-only.png"), "PNG")

# Also a transparent-background version for splash flexibility is unnecessary,
# but keep a void-background duplicate used by CI to be explicit.
print("done")
