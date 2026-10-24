#!/usr/bin/env python3
"""Create original procedural media for real Plozz screenshot captures.

No stock images, movie artwork, online metadata, recordings or external fonts.
The geometry, palettes, descriptions and subtitles are authored in this file.
"""
import argparse
import hashlib
import json
import math
import shutil
import subprocess
import cairosvg
from fontTools.ttLib import TTFont
from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
from xml.sax.saxutils import escape

CATALOGUE = [
    ("Orbital Drift", "A quiet journey through imaginary moons and distant rings.", "space", ["#090f2c", "#334f81", "#f7b783", "#9fcbd2"]),
    ("Tidal Light", "Layers of blue water follow the changing light across an imagined coast.", "water", ["#041c2a", "#1b6b83", "#93d6ce", "#e4ebc7"]),
    ("Amber Horizon", "A slow passage across dunes shaped by light and shadow.", "dunes", ["#291224", "#975751", "#e7a664", "#f4d4a0"]),
    ("Quiet Geometry", "An original study of circles, reflections and shifting perspective.", "arches", ["#152e31", "#326c63", "#b0c09a", "#edd9ab"]),
    ("Signal Garden", "An imaginary landscape grows from repeated lines and simple forms.", "forest", ["#071e25", "#23656a", "#79b6a0", "#d9d897"]),
    ("The Blue Interval", "Cloud-like forms move through a landscape made entirely from geometry.", "dunes", ["#16192e", "#474878", "#8997b8", "#dfc4bb"]),
    ("Plozz Field Notes", "Short visual studies of light, shape and imaginary landscapes.", "water", ["#082b34", "#246e7d", "#b5c6b1", "#ede1bc"]),
    ("Plozz Sky Studies", "A collection of original geometric journeys through imagined skies.", "space", ["#101b3e", "#384f83", "#b78ba3", "#e2b69a"]),
]


def artwork(kind, colors, variant=0):
    bg, middle, light, highlight = colors
    shapes = []
    if kind == "space":
        for i in range(150):
            x, y = (i * 317 + 91) % 1920, (i * 157 + 27) % 1080
            shapes.append(f'<circle cx="{x}" cy="{y}" r="{1 + i % 3}" fill="{highlight}" opacity="{.18 + (i % 7) * .07}"/>')
        shapes.append(f'<circle cx="1210" cy="480" r="300" fill="url(#orb)"/>')
        shapes.append(f'<ellipse cx="1210" cy="505" rx="540" ry="115" transform="rotate(-24 1210 505)" fill="none" stroke="{light}" stroke-width="30" opacity=".65"/>')
        shapes.append(f'<circle cx="700" cy="235" r="70" fill="{highlight}" opacity=".65"/>')
    elif kind in ("water", "dunes"):
        shapes.append(f'<circle cx="1250" cy="300" r="150" fill="{highlight}" opacity=".9"/>')
        for i in range(9):
            points = []
            for x in range(-20, 1961, 20):
                y = 430 + i * 84 + math.sin(x / (230 + i * 20) + i * .8 + variant) * (95 if kind == "dunes" else 35)
                points.append(f"{x},{y:.1f}")
            tone = colors[1 + i % 3]
            shapes.append(f'<path d="M {" L ".join(points)} L 1940,1100 L -20,1100 Z" fill="{tone}" opacity="{.38 + i * .045}"/>')
    elif kind == "arches":
        for i in range(10):
            x = 160 + i * 155
            shapes.append(f'<path d="M {x},1100 V 560 A 210 280 0 0 1 {x + 420},560 V 1100" fill="none" stroke="{colors[1 + i % 3]}" stroke-width="48" opacity=".7"/>')
        shapes.append(f'<circle cx="1350" cy="260" r="90" fill="{highlight}"/>')
    else:
        shapes.append(f'<circle cx="1200" cy="340" r="230" fill="{highlight}" opacity=".85"/>')
        for i in range(20):
            x = -60 + i * 112
            y = 400 + 160 * math.sin(i * 1.1)
            shapes.append(f'<path d="M{x},{y} L{x - 150},1080 H{x + 170} Z" fill="{colors[i % 3]}" opacity=".8"/>')
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
<defs>
<linearGradient id="sky" x2=".8" y2="1"><stop stop-color="{bg}"/><stop offset="1" stop-color="{middle}"/></linearGradient>
<radialGradient id="orb" cx=".3" cy=".25"><stop stop-color="{highlight}"/><stop offset=".5" stop-color="{light}"/><stop offset="1" stop-color="{middle}"/></radialGradient>
</defs><rect width="1920" height="1080" fill="url(#sky)"/>{''.join(shapes)}
</svg>'''


def run(*args):
    subprocess.run(args, check=True, stdout=subprocess.DEVNULL)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--posters-only", action="store_true")
    args = parser.parse_args()
    root = args.out.resolve()
    root.mkdir(parents=True, exist_ok=True)
    font_source = Path(__file__).resolve().parents[1] / "public/fonts/manrope-v20-latin.woff2"
    font_file = root / ".poster-font.ttf"
    font = TTFont(font_source)
    font.flavor = None
    font.save(font_file)
    for index, (title, plot, kind, colors) in enumerate(CATALOGUE):
        series = index >= 6
        folder = root / ("Shows" if series else "Movies") / title
        folder.mkdir(parents=True, exist_ok=True)
        svg = folder / "artwork.svg"
        svg.write_text(artwork(kind, colors, index), encoding="utf-8")
        raster = folder / ".artwork.png"
        cairosvg.svg2png(url=str(svg), write_to=str(raster))
        run("magick", str(raster), "-alpha", "off", str(folder / "fanart.jpg"))
        raster.unlink()
        run("magick", str(folder / "fanart.jpg"), "-gravity", "East", "-crop", "720x1080+180+0", "+repage", str(folder / "poster.jpg"))
        poster = Image.open(folder / "poster.jpg").convert("RGBA")
        shade = Image.new("RGBA", poster.size)
        draw = ImageDraw.Draw(shade)
        for y in range(1080):
            draw.line((0, y, 720, y), fill=(5, 10, 22, int(230 * max(0, (y - 420) / 660))))
        poster = Image.alpha_composite(poster, shade)
        draw = ImageDraw.Draw(poster)
        title_font = ImageFont.truetype(str(font_file), 76)
        title_font.set_variation_by_axes([700])
        small_font = ImageFont.truetype(str(font_file), 18)
        draw.text((48, 48), "PLOZZ DEMO", font=small_font, fill="#ffffff")
        words, lines = title.upper().split(), []
        for word in words:
            if lines and draw.textlength(lines[-1] + " " + word, font=title_font) <= 620:
                lines[-1] += " " + word
            else:
                lines.append(word)
        for line_index, line in enumerate(lines):
            draw.text((44, 940 - len(lines) * 88 + line_index * 88), line, font=title_font, fill="#ffffff")
        draw.text((48, 1010), "AN ORIGINAL VISUAL STUDY", font=small_font, fill="#d4dfeb")
        poster.convert("RGB").save(folder / "poster.jpg", quality=96)
        if args.posters_only:
            continue
        root_tag = "tvshow" if series else "movie"
        (folder / ("tvshow.nfo" if series else "movie.nfo")).write_text(
            f"<{root_tag}><title>{escape(title)}</title><year>2026</year>"
            f"<plot>{escape(plot)}</plot><genre>Visual studies</genre><studio>Plozz Demo</studio>"
            f"<runtime>3</runtime></{root_tag}>", encoding="utf-8")
        # A short original animated clip is repeated with stream copy, not synthesized UI.
        base = folder / ".motion.mp4"
        run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-loop", "1",
            "-i", str(folder / "fanart.jpg"), "-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo",
            "-vf", "scale=2000:-1,crop=1920:1080:x='40+35*sin(t/6)':y=20,format=yuv420p",
            "-t", "12", "-r", "24", "-c:v", "libx264", "-preset", "fast", "-crf", "19",
            "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", str(base))
        for episode in range(1, 5) if series else [0]:
            target = folder / (f"Season 01/{title} - S01E{episode:02d} - Study {episode}.mp4" if series else f"{title} (2026).mp4")
            target.parent.mkdir(exist_ok=True)
            run("ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-stream_loop", "14",
                "-i", str(base), "-c", "copy", "-t", "180", "-movflags", "+faststart", str(target))
            subtitle = "A new shape appears on the horizon.\nThe light moves, and the landscape changes."
            target.with_suffix(".en.srt").write_text("1\n00:00:00,000 --> 00:03:00,000\n" + subtitle + "\n", encoding="utf-8")
            if series:
                target.with_suffix(".nfo").write_text(
                    f"<episodedetails><title>Study {episode}: {['First light','A new perspective','Quiet motion','The long view'][episode-1]}</title>"
                    f"<season>1</season><episode>{episode}</episode><plot>{escape(plot)}</plot>"
                    f"<aired>2026-01-0{episode}</aired><runtime>3</runtime></episodedetails>", encoding="utf-8")
                shutil.copyfile(folder / "fanart.jpg", target.with_name(target.stem + "-thumb.jpg"))
        base.unlink()
        print(f"Created original {'series' if series else 'film'}: {title}", flush=True)
    font_file.unlink()
    inventory = []
    for path in sorted(root.rglob("*")):
        if path.is_file() and path.name != "provenance.json":
            inventory.append({"path": str(path.relative_to(root)), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()})
    (root / "provenance.json").write_text(json.dumps({
        "source": "tools/build-demo-library.py",
        "kind": "Original procedural vector artwork, animated media, metadata and subtitles",
        "posterTypeface": "Manrope, SIL Open Font License 1.1; see public/fonts/OFL.txt",
        "thirdPartyMedia": False, "onlineMetadata": False, "files": inventory,
    }, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
