from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

from pipeline.run import run_pipeline


class LocalEmbeddingClient:
    def __init__(self) -> None:
        self.calls = 0

    def embed_image(self, image_path: Path, model: str):
        self.calls += 1
        with Image.open(image_path) as image:
            red, green, blue = image.resize((1, 1)).getpixel((0, 0))
        return [red / 255, green / 255, blue / 255, (red + blue) / 510], 0.0, model


def test_clean_run_builds_consistent_release_and_rerun_is_idempotent(tmp_path: Path) -> None:
    source = tmp_path / "source"
    public = tmp_path / "public"
    work = tmp_path / "work"
    registry = tmp_path / "island_ids.json"
    source.mkdir()
    for index in range(8):
        color = (200, 40 + index, 60) if index < 4 else (40, 80 + index, 210)
        Image.new("RGB", (80 + index, 60), color).save(source / f"sample-{index}.jpg")

    client = LocalEmbeddingClient()
    first = run_pipeline(
        source,
        public,
        work,
        registry,
        client=client,
        n_clusters=2,
        max_spread_radians=2.0,
        tier_sizes={"sm": 16, "md": 32, "lg": 48},
    )
    first_layout = (public / "data" / "layout.json").read_bytes()
    second = run_pipeline(
        source,
        public,
        work,
        registry,
        client=client,
        n_clusters=2,
        max_spread_radians=2.0,
        tier_sizes={"sm": 16, "md": 32, "lg": 48},
    )

    layout = json.loads((public / "data" / "layout.json").read_text())
    islands = json.loads((public / "data" / "islands.json").read_text())
    assert first.sample_count == second.sample_count == 8
    assert first.island_count == second.island_count == 2
    assert (public / "data" / "layout.json").read_bytes() == first_layout
    assert len(list((public / "samples").glob("*/sm.webp"))) == 8
    assert len(list((public / "share").glob("*.jpg"))) == 2
    assert {record["islandId"] for record in layout} == {island["id"] for island in islands}
