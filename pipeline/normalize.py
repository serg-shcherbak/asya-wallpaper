from __future__ import annotations

import argparse
import hashlib
import json
import logging
from pathlib import Path
from typing import Mapping

from PIL import Image, ImageOps, UnidentifiedImageError

LOGGER = logging.getLogger(__name__)
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".tif", ".tiff"}
TIER_SIZES = {"sm": 128, "md": 640, "lg": 1280}
TIER_QUALITY = {"sm": 64, "md": 78, "lg": 84}


def stable_sample_id(path: Path) -> str:
    """Return an opaque id that remains stable when image bytes are re-encoded."""
    digest = hashlib.sha256(path.name.casefold().encode("utf-8")).hexdigest()[:12]
    return f"sample-{digest}"


def center_crop_square(image: Image.Image) -> Image.Image:
    image = ImageOps.exif_transpose(image).convert("RGB")
    edge = min(image.size)
    left = (image.width - edge) // 2
    top = (image.height - edge) // 2
    return image.crop((left, top, left + edge, top + edge))


def dominant_color(image: Image.Image) -> str:
    reduced = image.resize((48, 48), Image.Resampling.LANCZOS)
    palette = reduced.quantize(colors=8, method=Image.Quantize.MEDIANCUT)
    palette_values = palette.getpalette()
    most_common = max(palette.getcolors() or [(1, 0)], key=lambda item: item[0])[1]
    offset = most_common * 3
    red, green, blue = palette_values[offset : offset + 3]
    return f"#{red:02x}{green:02x}{blue:02x}"


def normalize_image(
    source: Path,
    output_root: Path,
    *,
    sizes: Mapping[str, int] = TIER_SIZES,
) -> dict[str, object]:
    sample_id = stable_sample_id(source)
    destination = output_root / sample_id
    destination.mkdir(parents=True, exist_ok=True)

    with Image.open(source) as opened:
        square = center_crop_square(opened)
        color = dominant_color(square)
        for tier, size in sizes.items():
            resized = square.resize((size, size), Image.Resampling.LANCZOS)
            resized.save(
                destination / f"{tier}.webp",
                format="WEBP",
                quality=TIER_QUALITY.get(tier, 78),
                method=6,
                exif=b"",
                icc_profile=None,
            )

    return {
        "id": sample_id,
        "srcset": {tier: f"/samples/{sample_id}/{tier}.webp" for tier in sizes},
        "dominantColor": color,
    }


def normalize_directory(
    source_root: Path,
    output_root: Path,
    manifest_path: Path,
    *,
    sizes: Mapping[str, int] = TIER_SIZES,
    limit: int | None = None,
) -> list[dict[str, object]]:
    output_root.mkdir(parents=True, exist_ok=True)
    candidates = sorted(
        (path for path in source_root.iterdir() if path.is_file() and path.suffix.casefold() in SUPPORTED_EXTENSIONS),
        key=lambda path: path.name.casefold(),
    )
    if limit is not None:
        candidates = candidates[:limit]

    records: list[dict[str, object]] = []
    for path in candidates:
        try:
            records.append(normalize_image(path, output_root, sizes=sizes))
        except (UnidentifiedImageError, OSError, ValueError) as error:
            LOGGER.warning("Skipping unreadable image %s: %s", path, error)

    active_ids = {str(record["id"]) for record in records}
    for previous in output_root.iterdir():
        if previous.is_dir() and previous.name.startswith("sample-") and previous.name not in active_ids:
            for generated in previous.iterdir():
                if generated.is_file() and generated.suffix == ".webp":
                    generated.unlink()
            try:
                previous.rmdir()
            except OSError:
                LOGGER.warning("Leaving non-generated files in stale directory %s", previous)

    manifest_path.parent.mkdir(parents=True, exist_ok=True)
    manifest_path.write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return records


def main() -> None:
    parser = argparse.ArgumentParser(description="Normalize wallpaper samples for the planetarium")
    parser.add_argument("--source", type=Path, default=Path("Обои"))
    parser.add_argument("--output", type=Path, default=Path("public/samples"))
    parser.add_argument("--manifest", type=Path, default=Path("pipeline/out/samples.json"))
    parser.add_argument("--limit", type=int)
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    records = normalize_directory(args.source, args.output, args.manifest, limit=args.limit)
    LOGGER.info("Normalized %d samples", len(records))


if __name__ == "__main__":
    main()
