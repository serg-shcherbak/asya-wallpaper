from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.islands import AnchorRegistryError, assign_islands, max_angular_spread


def make_data(groups: int = 3, per_group: int = 5):
    records: list[dict[str, object]] = []
    vectors: dict[str, list[float]] = {}
    positions: list[np.ndarray] = []
    axes = np.eye(3)
    for group in range(groups):
        for index in range(per_group):
            sample_id = f"sample-{group}-{index}"
            vector = axes[group] + np.array([index * 0.003, index * 0.002, 0.0])
            position = axes[group] + np.array([0.0, index * 0.01, index * 0.005])
            position = position / np.linalg.norm(position)
            records.append(
                {
                    "id": sample_id,
                    "srcset": {"sm": "/sm", "md": "/md", "lg": "/lg"},
                    "dominantColor": ["#cc6655", "#5577bb", "#d2b86a"][group],
                    "pos": {"x": position[0], "y": position[1], "z": position[2]},
                }
            )
            vectors[sample_id] = vector.tolist()
            positions.append(position)
    return records, vectors, np.asarray(positions)


def test_assigns_valid_islands_affinities_and_unit_centroids(tmp_path: Path) -> None:
    records, vectors, _ = make_data()
    result = assign_islands(
        records,
        vectors,
        tmp_path / "island_ids.json",
        n_clusters=3,
        seed=7,
    )

    island_ids = {island["id"] for island in result.islands}
    assert len(island_ids) == 3
    for record in result.layout:
        assert record["islandId"] in island_ids
        affinity = record["islandAffinity"]
        assert affinity
        assert affinity[0]["islandId"] == record["islandId"]
        assert [entry["weight"] for entry in affinity] == sorted(
            [entry["weight"] for entry in affinity], reverse=True
        )
    for island in result.islands:
        centroid = np.array(list(island["centroid"].values()))
        assert np.linalg.norm(centroid) == pytest.approx(1.0)
        assert island["color"].startswith("#")


def test_public_ids_survive_rebuild_and_new_non_anchor_sample(tmp_path: Path) -> None:
    records, vectors, _ = make_data()
    registry = tmp_path / "island_ids.json"
    first = assign_islands(records, vectors, registry, n_clusters=3, seed=3)
    first_ids = {record["id"]: record["islandId"] for record in first.layout}

    extra = dict(records[1])
    extra["id"] = "sample-0-extra"
    extra_vectors = {**vectors, "sample-0-extra": [1.0, 0.003, 0.002]}
    second = assign_islands([*records, extra], extra_vectors, registry, n_clusters=3, seed=3)
    second_ids = {record["id"]: record["islandId"] for record in second.layout}

    assert {sample_id: second_ids[sample_id] for sample_id in first_ids} == first_ids


def test_missing_or_ambiguous_anchor_fails_closed(tmp_path: Path) -> None:
    records, vectors, _ = make_data()
    registry = tmp_path / "island_ids.json"
    assign_islands(records, vectors, registry, n_clusters=3, seed=5)
    registry_data = json.loads(registry.read_text())
    missing_anchor = registry_data["islands"][0]["anchors"][0]

    kept_records = [record for record in records if record["id"] != missing_anchor]
    kept_vectors = {key: value for key, value in vectors.items() if key != missing_anchor}
    with pytest.raises(AnchorRegistryError, match="missing"):
        assign_islands(kept_records, kept_vectors, registry, n_clusters=3, seed=5)

    registry_data["islands"][0]["anchors"] = ["sample-0-0", "sample-1-0"]
    registry.write_text(json.dumps(registry_data))
    with pytest.raises(AnchorRegistryError, match="different clusters"):
        assign_islands(records, vectors, registry, n_clusters=3, seed=5)


def test_contour_gate_reclusters_spatially_scattered_embedding_groups(tmp_path: Path) -> None:
    records, vectors, positions = make_data()
    # Rotate the public positions so every embedding cluster is scattered across all axes.
    scrambled = positions.reshape(3, 5, 3).transpose(1, 0, 2).reshape(-1, 3)
    for record, position in zip(records, scrambled, strict=True):
        record["pos"] = {"x": position[0], "y": position[1], "z": position[2]}

    result = assign_islands(
        records,
        vectors,
        tmp_path / "island_ids.json",
        n_clusters=3,
        max_spread_radians=0.5,
        seed=11,
    )

    assert result.used_position_fallback
    for island in result.islands:
        members = [
            np.array(list(record["pos"].values()))
            for record in result.layout
            if record["islandId"] == island["id"]
        ]
        assert max_angular_spread(np.asarray(members)) <= 0.5
