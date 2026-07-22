from __future__ import annotations

from pathlib import Path
from typing import Sequence

from PIL import Image, ImageDraw, ImageFilter, ImageOps


def _rgb(value: str) -> tuple[int, int, int]:
    return tuple(int(value[index : index + 2], 16) for index in (1, 3, 5))


def _background(size: tuple[int, int], color: tuple[int, int, int]) -> Image.Image:
    width, height = size
    image = Image.new("RGB", size)
    pixels = image.load()
    for y in range(height):
        for x in range(width):
            distance = ((x - width * 0.72) ** 2 + (y - height * 0.28) ** 2) ** 0.5
            glow = max(0.0, 1.0 - distance / max(width, height))
            pixels[x, y] = tuple(
                int(min(255, 8 + channel * (0.24 + glow * 0.55))) for channel in color
            )
    return image.filter(ImageFilter.GaussianBlur(radius=max(2, width // 120)))


def generate_share_cards(
    islands: Sequence[dict[str, object]],
    samples: Sequence[dict[str, object]],
    public_root: Path,
    share_root: Path,
    *,
    size: tuple[int, int] = (1200, 630),
) -> list[Path]:
    share_root.mkdir(parents=True, exist_ok=True)
    active_names = {f"{island['id']}.jpg" for island in islands}
    for stale in share_root.glob("*.jpg"):
        if stale.name not in active_names:
            stale.unlink()

    generated: list[Path] = []
    for island in islands:
        island_id = str(island["id"])
        card = _background(size, _rgb(str(island["color"])))
        draw = ImageDraw.Draw(card, "RGBA")
        members = [sample for sample in samples if sample.get("islandId") == island_id][:4]
        tile = int(min(size[1] * 0.58, size[0] * 0.25))
        gap = max(8, tile // 16)
        total_width = len(members) * tile + max(0, len(members) - 1) * gap
        start_x = (size[0] - total_width) // 2
        y = (size[1] - tile) // 2
        for index, sample in enumerate(members):
            srcset = sample["srcset"]
            source = public_root / str(srcset["md"]).removeprefix("/")
            with Image.open(source) as opened:
                preview = ImageOps.fit(opened.convert("RGB"), (tile, tile), Image.Resampling.LANCZOS)
            x = start_x + index * (tile + gap)
            card.paste(preview, (x, y))
            draw.rounded_rectangle(
                (x, y, x + tile, y + tile),
                radius=max(4, tile // 24),
                outline=(255, 244, 232, 125),
                width=max(1, tile // 80),
            )
        draw.ellipse(
            (size[0] * 0.08, size[1] * 0.14, size[0] * 0.1, size[1] * 0.18),
            fill=(255, 245, 232, 210),
        )
        destination = share_root / f"{island_id}.jpg"
        card.save(destination, format="JPEG", quality=88, optimize=True, exif=b"")
        generated.append(destination)
    return generated
