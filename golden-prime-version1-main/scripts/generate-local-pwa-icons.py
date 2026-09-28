from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "client" / "public"
root.mkdir(parents=True, exist_ok=True)
for size, filename in ((192, "golden-prime-icon-192.png"), (512, "golden-prime-icon-512.png")):
    image = Image.new("RGBA", (size, size), "#123B38")
    draw = ImageDraw.Draw(image)
    radius = size // 5
    draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill="#123B38")
    left = size // 4
    top = size // 4
    right = size * 3 // 4
    bottom = size * 3 // 4
    draw.polygon([(left, bottom), (left, top + size // 8), (size // 2, top), (right, top + size // 8), (right, bottom)], fill="#BEE7D7")
    draw.rectangle((size * 5 // 12, top + size // 12, size * 7 // 12, bottom), fill="#0A6558")
    window = size // 14
    for x in (left + size // 16, right - size // 16 - window):
        for y in (top + size // 5, top + size * 2 // 5):
            draw.rectangle((x, y, x + window, y + window), fill="#123B38")
    draw.rectangle((size * 11 // 24, size * 3 // 5, size * 13 // 24, bottom), fill="#F8F7F3")
    image.save(root / filename, optimize=True)
