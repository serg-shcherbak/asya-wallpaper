from __future__ import annotations

import hashlib
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping, Sequence

import numpy as np

os.environ.setdefault("LOKY_MAX_CPU_COUNT", "1")

from sklearn.cluster import KMeans


class AnchorRegistryError(RuntimeError):
    pass


@dataclass(frozen=True)
class IslandBuild:
    layout: list[dict[str, object]]
    islands: list[dict[str, object]]
    used_position_fallback: bool


def _unit_rows(matrix: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    return matrix / np.maximum(norms, 1e-12)


def max_angular_spread(positions: np.ndarray) -> float:
    if len(positions) <= 1:
        return 0.0
    unit_positions = _unit_rows(np.asarray(positions, dtype=np.float64))
    centroid = unit_positions.mean(axis=0)
    centroid /= max(np.linalg.norm(centroid), 1e-12)
    angles = np.arccos(np.clip(unit_positions @ centroid, -1.0, 1.0))
    return float(np.max(angles))


def _cluster(matrix: np.ndarray, count: int, seed: int) -> np.ndarray:
    return KMeans(n_clusters=count, random_state=seed, n_init=20).fit_predict(matrix)


def _stable_id(anchor: str) -> str:
    digest = hashlib.sha256(anchor.encode("utf-8")).hexdigest()[:8]
    return f"island-{digest}"


def _load_registry(path: Path) -> list[dict[str, object]]:
    if not path.exists():
        return []
    body = json.loads(path.read_text(encoding="utf-8"))
    islands = body.get("islands") if isinstance(body, dict) else None
    if not isinstance(islands, list):
        raise AnchorRegistryError("Anchor registry must contain an islands list")
    return islands


def _resolve_public_ids(
    sample_ids: Sequence[str], labels: np.ndarray, registry_path: Path
) -> tuple[dict[int, str], list[dict[str, object]]]:
    label_by_sample = dict(zip(sample_ids, labels.tolist(), strict=True))
    existing = _load_registry(registry_path)
    public_by_label: dict[int, str] = {}
    registry_by_label: dict[int, dict[str, object]] = {}

    for entry in existing:
        public_id = entry.get("id")
        anchors = entry.get("anchors")
        if not isinstance(public_id, str) or not isinstance(anchors, list) or not anchors:
            raise AnchorRegistryError("Every registry island needs an id and at least one anchor")
        missing = [anchor for anchor in anchors if anchor not in label_by_sample]
        if missing:
            raise AnchorRegistryError(f"Registry anchor is missing: {missing[0]}")
        anchor_labels = {label_by_sample[str(anchor)] for anchor in anchors}
        if len(anchor_labels) != 1:
            raise AnchorRegistryError(f"Anchors for {public_id} landed in different clusters")
        label = anchor_labels.pop()
        if label in public_by_label:
            raise AnchorRegistryError(
                f"Registry ids {public_by_label[label]} and {public_id} resolve to the same cluster"
            )
        public_by_label[label] = public_id
        registry_by_label[label] = {"id": public_id, "anchors": [str(anchor) for anchor in anchors]}

    for label in sorted(set(labels.tolist())):
        if label in public_by_label:
            continue
        members = sorted(sample_id for sample_id, member_label in label_by_sample.items() if member_label == label)
        anchor = members[0]
        public_id = _stable_id(anchor)
        if public_id in public_by_label.values():
            raise AnchorRegistryError(f"Generated duplicate public island id {public_id}")
        public_by_label[label] = public_id
        registry_by_label[label] = {"id": public_id, "anchors": [anchor]}

    ordered_registry = [registry_by_label[label] for label in sorted(registry_by_label, key=public_by_label.get)]
    registry_path.parent.mkdir(parents=True, exist_ok=True)
    registry_path.write_text(
        json.dumps({"version": 1, "islands": ordered_registry}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return public_by_label, ordered_registry


def _hex_to_rgb(value: str) -> np.ndarray:
    return np.array([int(value[index : index + 2], 16) for index in (1, 3, 5)], dtype=np.float64)


def _rgb_to_hex(value: np.ndarray) -> str:
    red, green, blue = np.clip(np.rint(value), 0, 255).astype(int)
    return f"#{red:02x}{green:02x}{blue:02x}"


def _affinities(
    vectors: np.ndarray,
    labels: np.ndarray,
    public_by_label: Mapping[int, str],
) -> list[list[dict[str, object]]]:
    centers = {
        label: vectors[labels == label].mean(axis=0)
        for label in sorted(set(labels.tolist()))
    }
    normalized_vectors = _unit_rows(vectors)
    normalized_centers = {label: center / max(np.linalg.norm(center), 1e-12) for label, center in centers.items()}
    results: list[list[dict[str, object]]] = []
    for index, vector in enumerate(normalized_vectors):
        assigned = int(labels[index])
        distances = {
            label: float(1.0 - np.clip(vector @ center, -1.0, 1.0))
            for label, center in normalized_centers.items()
        }
        ordered = sorted(distances, key=lambda label: (label != assigned, distances[label]))[:3]
        raw = np.exp(-np.array([distances[label] for label in ordered]) / 0.22)
        weights = raw / raw.sum()
        affinity = [
            {"islandId": public_by_label[label], "weight": round(float(weight), 6)}
            for label, weight in zip(ordered, weights, strict=True)
        ]
        affinity.sort(key=lambda entry: float(entry["weight"]), reverse=True)
        if affinity[0]["islandId"] != public_by_label[assigned]:
            assigned_entry = next(
                entry for entry in affinity if entry["islandId"] == public_by_label[assigned]
            )
            affinity.remove(assigned_entry)
            affinity.insert(0, assigned_entry)
        results.append(affinity)
    return results


def assign_islands(
    records: Sequence[dict[str, object]],
    vectors_by_id: Mapping[str, Sequence[float]],
    registry_path: Path,
    *,
    n_clusters: int | None = None,
    max_spread_radians: float = 1.05,
    seed: int = 41,
    existing_islands: Sequence[dict[str, object]] | None = None,
) -> IslandBuild:
    if len(records) < 2:
        raise ValueError("At least two samples are required to form islands")
    sample_ids = [str(record["id"]) for record in records]
    try:
        vectors = np.asarray([vectors_by_id[sample_id] for sample_id in sample_ids], dtype=np.float64)
    except KeyError as error:
        raise ValueError(f"Missing embedding for {error.args[0]}") from error
    positions = np.asarray(
        [
            [float(record["pos"][axis]) for axis in ("x", "y", "z")]
            for record in records
        ],
        dtype=np.float64,
    )
    count = n_clusters or min(12, max(6, round(np.sqrt(len(records)))))
    count = min(count, len(records))
    labels = _cluster(vectors, count, seed)
    used_position_fallback = any(
        max_angular_spread(positions[labels == label]) > max_spread_radians
        for label in set(labels.tolist())
    )
    if used_position_fallback:
        labels = _cluster(positions, count, seed)
        failing = [
            label
            for label in set(labels.tolist())
            if max_angular_spread(positions[labels == label]) > max_spread_radians
        ]
        if failing:
            raise ValueError(f"Spatial contour gate failed for clusters {failing}")

    public_by_label, _ = _resolve_public_ids(sample_ids, labels, registry_path)
    names = {
        str(island["id"]): str(island["name"])
        for island in (existing_islands or [])
        if isinstance(island.get("id"), str) and isinstance(island.get("name"), str)
    }
    affinities = _affinities(vectors, labels, public_by_label)

    layout: list[dict[str, object]] = []
    for index, record in enumerate(records):
        public_id = public_by_label[int(labels[index])]
        layout.append(
            {
                **record,
                "islandId": public_id,
                "islandAffinity": affinities[index],
            }
        )

    islands: list[dict[str, object]] = []
    for ordinal, label in enumerate(sorted(set(labels.tolist()), key=public_by_label.get), start=1):
        member_positions = _unit_rows(positions[labels == label])
        centroid = member_positions.mean(axis=0)
        centroid /= max(np.linalg.norm(centroid), 1e-12)
        member_colors = np.asarray(
            [_hex_to_rgb(str(records[index]["dominantColor"])) for index in np.where(labels == label)[0]]
        )
        public_id = public_by_label[label]
        islands.append(
            {
                "id": public_id,
                "name": names.get(public_id, f"Остров {ordinal:02d}"),
                "centroid": {
                    "x": round(float(centroid[0]), 8),
                    "y": round(float(centroid[1]), 8),
                    "z": round(float(centroid[2]), 8),
                },
                "color": _rgb_to_hex(member_colors.mean(axis=0)),
            }
        )

    return IslandBuild(layout=layout, islands=islands, used_position_fallback=used_position_fallback)


def write_island_artifacts(build: IslandBuild, layout_path: Path, islands_path: Path) -> None:
    layout_path.parent.mkdir(parents=True, exist_ok=True)
    islands_path.parent.mkdir(parents=True, exist_ok=True)
    layout_path.write_text(json.dumps(build.layout, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    islands_path.write_text(json.dumps(build.islands, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
