# Draws the Osembo app icons (a gold ring and a cream "O" on dark green). Run by the build, no fonts needed.
from PIL import Image, ImageDraw
import os

GREEN, GOLD, CREAM = "#0B4F4A", "#B8892B", "#F6F1E4"

def icon(n, k):
    im = Image.new("RGB", (n, n), GREEN)
    d = ImageDraw.Draw(im)
    c = n / 2
    def disc(r, col):
        d.ellipse([c - r, c - r, c + r, c + r], fill=col)
    r = n * k
    disc(r, GOLD)
    disc(r * 0.93, GREEN)
    disc(r * 0.66, CREAM)
    disc(r * 0.38, GREEN)
    return im

os.makedirs("icons", exist_ok=True)
os.makedirs("assets", exist_ok=True)
icon(192, 0.42).save("icons/icon-192.png")
icon(512, 0.42).save("icons/icon-512.png")
icon(512, 0.34).save("icons/icon-maskable-512.png")
icon(1024, 0.34).save("assets/icon.png")
splash = Image.new("RGB", (2732, 2732), GREEN)
splash.paste(icon(900, 0.40), ((2732 - 900) // 2, (2732 - 900) // 2))
splash.save("assets/splash.png")
print("icons made")
