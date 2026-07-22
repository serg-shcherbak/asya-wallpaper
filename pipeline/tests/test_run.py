from __future__ import annotations

import json
from pathlib import Path

import pytest
from PIL import Image

import pipeline.run as run_module
from pipeline.run import run_pipeline


class LocalEmbeddingClient:
    def __init__(self) -> None:
        self.calls = 0

    def embed_image(self, image_path: Path, model: str):
        self.calls += 1
        with Image.open(image_path) as image:
            red, green, blue = image.resize((1, 1)).getpixel((0, 0))
        return [red / 255, green / 255, blue / 255, (red + blue) / 510], 0.0, model


def _public_bytes(public: Path) -> dict[str, bytes]:
    return {
        f"{directory.name}/{path.relative_to(directory)}": path.read_bytes()
        for directory in (public / "samples", public / "data", public / "share")
        for path in directory.rglob("*")
        if path.is_file()
    }


def _published_bytes(public: Path, registry: Path) -> dict[str, bytes]:
    files = _public_bytes(public)
    files["island_ids.json"] = registry.read_bytes()
    return files


def _build_release(tmp_path: Path) -> tuple[Path, Path, Path, Path, LocalEmbeddingClient]:
    source = tmp_path / "source"
    public = tmp_path / "public"
    work = tmp_path / "work"
    registry = tmp_path / "island_ids.json"
    source.mkdir()
    for index in range(8):
        color = (200, 40 + index, 60) if index < 4 else (40, 80 + index, 210)
        Image.new("RGB", (80 + index, 60), color).save(source / f"sample-{index}.jpg")

    client = LocalEmbeddingClient()
    run_pipeline(
        source,
        public,
        work,
        registry,
        client=client,
        n_clusters=2,
        max_spread_radians=2.0,
        tier_sizes={"sm": 16, "md": 32, "lg": 48},
    )
    Image.new("RGB", (96, 64), (40, 210, 70)).save(source / "new-sample.jpg")
    return source, public, work, registry, client


def _run_expanded_release(
    source: Path, public: Path, work: Path, registry: Path, client: LocalEmbeddingClient
) -> None:
    run_pipeline(
        source,
        public,
        work,
        registry,
        client=client,
        n_clusters=3,
        max_spread_radians=2.0,
        tier_sizes={"sm": 16, "md": 32, "lg": 48},
        reconcile_registry=True,
    )


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


def test_registry_replace_failure_rolls_back_public_release_and_registry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, public, work, registry, client = _build_release(tmp_path)
    previous = _published_bytes(public, registry)
    previous_public = {key: value for key, value in previous.items() if key != "island_ids.json"}
    original_replace = run_module.os.replace
    fail_once = True

    def fail_registry_install(source_path: str | Path, destination_path: str | Path) -> None:
        nonlocal fail_once
        if fail_once and Path(destination_path) == registry:
            fail_once = False
            current_public = _public_bytes(public)
            assert current_public != previous_public
            raise OSError("injected registry replacement failure")
        original_replace(source_path, destination_path)

    monkeypatch.setattr(run_module.os, "replace", fail_registry_install)

    with pytest.raises(OSError, match="injected registry replacement failure"):
        _run_expanded_release(source, public, work, registry, client)

    assert _published_bytes(public, registry) == previous


def test_mid_directory_install_failure_rolls_back_public_release_and_registry(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    source, public, work, registry, client = _build_release(tmp_path)
    previous = _published_bytes(public, registry)
    original_replace = run_module.os.replace
    fail_once = True

    def fail_data_install(source_path: str | Path, destination_path: str | Path) -> None:
        nonlocal fail_once
        if fail_once and Path(destination_path) == public / "data" and Path(source_path).name == "data":
            fail_once = False
            raise OSError("injected data install failure")
        original_replace(source_path, destination_path)

    monkeypatch.setattr(run_module.os, "replace", fail_data_install)

    with pytest.raises(OSError, match="injected data install failure"):
        _run_expanded_release(source, public, work, registry, client)

    assert _published_bytes(public, registry) == previous
