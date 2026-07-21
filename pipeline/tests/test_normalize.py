from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from pipeline.normalize import normalize_directory


def make_source(path: Path, size: tuple[int, int], color: tuple[int, int, int]) -> None:
    image = Image.new("RGB", size, color)
    exif = Image.Exif()
    exif[0x010E] = "private description"
    exif[0x013B] = "private author"
    image.save(path, exif=exif)


def test_normalizes_to_square_webp_without_metadata(tmp_path: Path) -> None:
    source = tmp_path / "source"
    output = tmp_path / "public" / "samples"
    manifest = tmp_path / "out" / "samples.json"
    source.mkdir()
    make_source(source / "wide.jpg", (300, 200), (180, 40, 80))

    records = normalize_directory(source, output, manifest, sizes={"sm": 32, "md": 64, "lg": 96})

    assert len(records) == 1
    record = records[0]
    assert record["dominantColor"].startswith("#")
    assert len(record["dominantColor"]) == 7
    for tier, expected_size in (("sm", 32), ("md", 64), ("lg", 96)):
        path = output.parent / record["srcset"][tier].removeprefix("/")
        with Image.open(path) as image:
            assert image.size == (expected_size, expected_size)
            assert image.format == "WEBP"
            assert not image.getexif()
            assert "exif" not in image.info

    assert json.loads(manifest.read_text())[0] == record


def test_handles_extreme_aspect_ratio_and_is_deterministic(tmp_path: Path) -> None:
    source = tmp_path / "source"
    output = tmp_path / "public" / "samples"
    manifest = tmp_path / "out" / "samples.json"
    source.mkdir()
    make_source(source / "ultra-wide.jpeg", (1000, 40), (12, 140, 210))

    first = normalize_directory(source, output, manifest, sizes={"sm": 24, "md": 48, "lg": 72})
    second = normalize_directory(source, output, manifest, sizes={"sm": 24, "md": 48, "lg": 72})

    assert first == second
    assert next((output / first[0]["id"]).glob("md.webp")).exists()


def test_skips_corrupt_files_with_warning(tmp_path: Path, caplog) -> None:
    source = tmp_path / "source"
    output = tmp_path / "public" / "samples"
    manifest = tmp_path / "out" / "samples.json"
    source.mkdir()
    (source / "broken.jpg").write_text("not an image")
    make_source(source / "valid.jpg", (60, 100), (80, 90, 100))

    records = normalize_directory(source, output, manifest, sizes={"sm": 16, "md": 32, "lg": 48})

    assert len(records) == 1
    assert "Skipping unreadable image" in caplog.text
