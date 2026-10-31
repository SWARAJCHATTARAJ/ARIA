import os
import math
from PIL import Image, ImageDraw, ImageFilter

MASTER_SIZE = 1024

DENSITIES = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}

BG_COLOR = (5, 8, 17, 255)         # #050811
NEON_CYAN = (6, 182, 212, 255)     # #06b6d4
CYAN_GLOW = (34, 211, 238, 180)    # #22d3ee
CYAN_LIGHT = (56, 189, 248, 255)   # #38bdf8
WHITE = (255, 255, 255, 255)
INDIGO_ACCENT = (99, 102, 241, 200)

def create_emblem_layer(size=MASTER_SIZE, is_foreground=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    cx, cy = size / 2, size / 2

    # Scale factor for emblem (if foreground, scale slightly to stay within adaptive safe zone)
    scale = 0.62 if is_foreground else 0.72

    # 1. Subtle radial glow behind emblem
    glow_img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_r = int(220 * scale)
    for r in range(glow_r, 0, -12):
        alpha = int(35 * (1 - r / glow_r))
        glow_draw.ellipse(
            [cx - r, cy - r, cx + r, cy + r],
            fill=(6, 182, 212, alpha)
        )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=int(18 * scale)))
    img = Image.alpha_composite(img, glow_img)
    draw = ImageDraw.Draw(img)

    # 2. Orbital Ellipse (tilted 25 deg)
    orbit_points = []
    rx = 290 * scale
    ry = 130 * scale
    theta = math.radians(-28)
    cos_t, sin_t = math.cos(theta), math.sin(theta)

    for deg in range(0, 360, 2):
        rad = math.radians(deg)
        x0 = rx * math.cos(rad)
        y0 = ry * math.sin(rad)
        x = cx + x0 * cos_t - y0 * sin_t
        y = cy + x0 * sin_t + y0 * cos_t
        orbit_points.append((x, y))

    # Draw orbital ring glow and crisp line
    for i in range(len(orbit_points)):
        p1 = orbit_points[i]
        p2 = orbit_points[(i + 1) % len(orbit_points)]
        # outer faint glow
        draw.line([p1, p2], fill=(6, 182, 212, 70), width=int(14 * scale))
        # inner cyan ring
        draw.line([p1, p2], fill=NEON_CYAN, width=int(6 * scale))
        # crisp white/cyan core
        draw.line([p1, p2], fill=CYAN_LIGHT, width=int(2.5 * scale))

    # Orbital nodes / data particles
    for angle_deg in [35, 155, 275]:
        rad = math.radians(angle_deg)
        x0 = rx * math.cos(rad)
        y0 = ry * math.sin(rad)
        nx = cx + x0 * cos_t - y0 * sin_t
        ny = cy + x0 * sin_t + y0 * cos_t
        nr = int(9 * scale)
        draw.ellipse([nx - nr * 2, ny - nr * 2, nx + nr * 2, ny + nr * 2], fill=(6, 182, 212, 100))
        draw.ellipse([nx - nr, ny - nr, nx + nr, ny + nr], fill=CYAN_LIGHT)
        draw.ellipse([nx - nr * 0.5, ny - nr * 0.5, nx + nr * 0.5, ny + nr * 0.5], fill=WHITE)

    # 3. Geometric ARIA 'A' Monogram / Delta Glyph
    # Apex, Left foot, Right foot
    top_y = cy - (195 * scale)
    bot_y = cy + (195 * scale)
    left_x = cx - (175 * scale)
    right_x = cx + (175 * scale)
    
    # Left leg
    draw.line([(cx, top_y), (left_x, bot_y)], fill=(6, 182, 212, 90), width=int(22 * scale))
    draw.line([(cx, top_y), (left_x, bot_y)], fill=NEON_CYAN, width=int(14 * scale))
    draw.line([(cx, top_y), (left_x, bot_y)], fill=WHITE, width=int(4 * scale))

    # Right leg
    draw.line([(cx, top_y), (right_x, bot_y)], fill=(6, 182, 212, 90), width=int(22 * scale))
    draw.line([(cx, top_y), (right_x, bot_y)], fill=NEON_CYAN, width=int(14 * scale))
    draw.line([(cx, top_y), (right_x, bot_y)], fill=WHITE, width=int(4 * scale))

    # Horizontal quantum crossbar
    cross_y = cy + (50 * scale)
    bar_half_w = 95 * scale
    draw.line([(cx - bar_half_w, cross_y), (cx + bar_half_w, cross_y)], fill=(6, 182, 212, 120), width=int(16 * scale))
    draw.line([(cx - bar_half_w, cross_y), (cx + bar_half_w, cross_y)], fill=CYAN_LIGHT, width=int(8 * scale))
    draw.line([(cx - bar_half_w, cross_y), (cx + bar_half_w, cross_y)], fill=WHITE, width=int(2.5 * scale))

    # Apex core node
    apex_r = int(14 * scale)
    draw.ellipse([cx - apex_r * 2, top_y - apex_r * 2, cx + apex_r * 2, top_y + apex_r * 2], fill=(6, 182, 212, 120))
    draw.ellipse([cx - apex_r, top_y - apex_r, cx + apex_r, top_y + apex_r], fill=CYAN_LIGHT)
    draw.ellipse([cx - apex_r * 0.5, top_y - apex_r * 0.5, cx + apex_r * 0.5, top_y + apex_r * 0.5], fill=WHITE)

    # Center floating neural node
    core_y = cy + (5 * scale)
    cr = int(18 * scale)
    draw.ellipse([cx - cr * 2, core_y - cr * 2, cx + cr * 2, core_y + cr * 2], fill=(6, 182, 212, 90))
    draw.ellipse([cx - cr, core_y - cr, cx + cr, core_y + cr], fill=CYAN_LIGHT)
    draw.ellipse([cx - cr * 0.5, core_y - cr * 0.5, cx + cr * 0.5, core_y + cr * 0.5], fill=WHITE)

    return img

def create_launcher_master(kind='square'):
    base = Image.new('RGBA', (MASTER_SIZE, MASTER_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(base)

    if kind == 'square':
        # Obsidian rounded rectangle with subtle neon cyan border
        draw.rounded_rectangle([20, 20, MASTER_SIZE - 20, MASTER_SIZE - 20], radius=180, fill=BG_COLOR)
        # Inner neon border
        draw.rounded_rectangle([20, 20, MASTER_SIZE - 20, MASTER_SIZE - 20], radius=180, outline=(6, 182, 212, 140), width=12)
        emblem = create_emblem_layer(MASTER_SIZE, is_foreground=False)
        base = Image.alpha_composite(base, emblem)
    elif kind == 'round':
        # Obsidian circular background with neon border
        cx, cy = MASTER_SIZE / 2, MASTER_SIZE / 2
        r = (MASTER_SIZE / 2) - 20
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BG_COLOR)
        draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=(6, 182, 212, 160), width=14)
        emblem = create_emblem_layer(MASTER_SIZE, is_foreground=False)
        base = Image.alpha_composite(base, emblem)
    elif kind == 'foreground':
        # Transparent background, emblem scaled for adaptive icon
        emblem = create_emblem_layer(MASTER_SIZE, is_foreground=True)
        base = Image.alpha_composite(base, emblem)

    return base

def generate_all(res_dir):
    print(f"Generating Android launcher icons into: {res_dir}")
    os.makedirs(res_dir, exist_ok=True)

    master_square = create_launcher_master('square')
    master_round = create_launcher_master('round')
    master_foreground = create_launcher_master('foreground')

    for density_name, size in DENSITIES.items():
        density_dir = os.path.join(res_dir, density_name)
        os.makedirs(density_dir, exist_ok=True)

        # 1. ic_launcher.png
        icon_sq = master_square.resize((size, size), Image.Resampling.LANCZOS)
        sq_path = os.path.join(density_dir, 'ic_launcher.png')
        icon_sq.save(sq_path, 'PNG', optimize=True)

        # 2. ic_launcher_round.png
        icon_rd = master_round.resize((size, size), Image.Resampling.LANCZOS)
        rd_path = os.path.join(density_dir, 'ic_launcher_round.png')
        icon_rd.save(rd_path, 'PNG', optimize=True)

        # 3. ic_launcher_foreground.png
        icon_fg = master_foreground.resize((size, size), Image.Resampling.LANCZOS)
        fg_path = os.path.join(density_dir, 'ic_launcher_foreground.png')
        icon_fg.save(fg_path, 'PNG', optimize=True)

        print(f"  [{density_name}] ({size}x{size}) -> ic_launcher.png, ic_launcher_round.png, ic_launcher_foreground.png")

    print("Android launcher icons successfully generated!")

if __name__ == '__main__':
    res_path = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', 'android', 'app', 'src', 'main', 'res'))
    generate_all(res_path)
