from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from pipeline.islands import AnchorRegistryError, assign_islands, max_angular_spread, reconcile_public_ids


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


def test_explicit_reconciliation_moves_colliding_anchor_by_prior_overlap(tmp_path: Path) -> None:
    registry = tmp_path / "island_ids.json"
    registry.write_text(
        json.dumps(
            {
                "version": 1,
                "islands": [
                    {"id": "island-a", "anchors": ["a1"]},
                    {"id": "island-b", "anchors": ["b1"]},
                ],
            }
        )
    )
    sample_ids = ["a1", "a2", "a3", "b1", "b2", "b3"]
    labels = np.asarray([0, 0, 1, 0, 1, 1])
    existing_layout = [
        {"id": sample_id, "islandId": "island-a" if sample_id.startswith("a") else "island-b"}
        for sample_id in sample_ids
    ]

    public_by_label, entries = reconcile_public_ids(sample_ids, labels, registry, existing_layout)

    assert public_by_label == {0: "island-a", 1: "island-b"}
    assert entries == [
        {"id": "island-a", "anchors": ["a1"]},
        {"id": "island-b", "anchors": ["b2"]},
    ]


def test_explicit_reconciliation_rejects_an_ambiguous_mapping(tmp_path: Path) -> None:
    registry = tmp_path / "island_ids.json"
    registry.write_text(
        json.dumps(
            {
                "version": 1,
                "islands": [
                    {"id": "island-a", "anchors": ["a1"]},
                    {"id": "island-b", "anchors": ["b1"]},
                ],
            }
        )
    )
    sample_ids = ["a1", "a2", "b1", "b2"]
    labels = np.asarray([0, 1, 0, 1])
    existing_layout = [
        {"id": sample_id, "islandId": "island-a" if sample_id.startswith("a") else "island-b"}
        for sample_id in sample_ids
    ]

    with pytest.raises(AnchorRegistryError, match="ambiguous"):
        reconcile_public_ids(sample_ids, labels, registry, existing_layout)


def test_explicit_reconciliation_uses_embedding_similarity_for_an_orphan_id(tmp_path: Path) -> None:
    registry = tmp_path / "island_ids.json"
    registry.write_text(
        json.dumps(
            {
                "version": 1,
                "islands": [
                    {"id": "island-a", "anchors": ["a1"]},
                    {"id": "island-b", "anchors": ["b1"]},
                ],
            }
        )
    )
    sample_ids = ["a1", "b1", "new"]
    labels = np.asarray([0, 0, 1])
    existing_layout = [
        {"id": "a1", "islandId": "island-a"},
        {"id": "b1", "islandId": "island-b"},
    ]
    vectors = {
        "a1": [1.0, 0.0],
        "b1": [0.0, 1.0],
        "new": [0.0, 0.99],
    }

    public_by_label, _ = reconcile_public_ids(sample_ids, labels, registry, existing_layout, vectors)

    assert public_by_label == {0: "island-a", 1: "island-b"}


def test_explicit_reconciliation_preserves_old_ids_while_adding_a_new_island(tmp_path: Path) -> None:
    registry = tmp_path / "island_ids.json"
    registry.write_text(
        json.dumps(
            {
                "version": 1,
                "islands": [
                    {"id": "island-a", "anchors": ["a1"]},
                    {"id": "island-b", "anchors": ["b1"]},
                ],
            }
        )
    )
    sample_ids = ["a1", "b1", "new"]
    labels = np.asarray([0, 1, 2])
    existing_layout = [
        {"id": "a1", "islandId": "island-a"},
        {"id": "b1", "islandId": "island-b"},
    ]

    public_by_label, entries = reconcile_public_ids(sample_ids, labels, registry, existing_layout)

    assert public_by_label[0] == "island-a"
    assert public_by_label[1] == "island-b"
    assert public_by_label[2].startswith("island-")
    assert len(entries) == 3


def test_expansion_skips_an_anchor_hash_already_used_by_an_old_public_id(tmp_path: Path) -> None:
    registry = tmp_path / "island_ids.json"
    registry.write_text(
        json.dumps(
            {
                "version": 1,
                "islands": [
                    {"id": "island-11507a0e", "anchors": ["old"]},
                ],
            }
        )
    )
    sample_ids = ["old", "new", "spare"]
    labels = np.asarray([0, 1, 1])
    existing_layout = [{"id": "old", "islandId": "island-11507a0e"}]

    public_by_label, _ = reconcile_public_ids(sample_ids, labels, registry, existing_layout)

    assert len(set(public_by_label.values())) == 2
