from __future__ import annotations

from typing import Sequence

import numpy as np
import umap


def _scale_to_range(values: np.ndarray, radius: float) -> np.ndarray:
    centered = values - np.median(values)
    spread = np.max(np.abs(centered))
    if spread < 1e-12:
        return np.zeros_like(centered)
    return centered / spread * radius


def project_embeddings(vectors: np.ndarray, *, seed: int = 41) -> np.ndarray:
    matrix = np.asarray(vectors, dtype=np.float64)
    if matrix.ndim != 2 or len(matrix) == 0:
        raise ValueError("Embeddings must be a non-empty 2D matrix")
    if len(matrix) < 4:
        golden_angle = np.pi * (3.0 - np.sqrt(5.0))
        indices = np.arange(len(matrix), dtype=np.float64)
        y = 1.0 - 2.0 * (indices + 0.5) / len(matrix)
        radius = np.sqrt(np.maximum(0.0, 1.0 - y * y))
        theta = golden_angle * indices
        return np.column_stack((np.cos(theta) * radius, y, np.sin(theta) * radius))

    reducer = umap.UMAP(
        n_components=2,
        n_neighbors=min(12, max(2, int(np.sqrt(len(matrix))))),
        init="pca",
        min_dist=0.18,
        metric="cosine",
        output_metric="haversine",
        random_state=seed,
        n_jobs=1,
        transform_seed=seed,
    )
    coordinates = reducer.fit_transform(matrix)
    latitude = _scale_to_range(coordinates[:, 0], np.pi * 0.46)
    longitude = _scale_to_range(coordinates[:, 1], np.pi)
    cos_latitude = np.cos(latitude)
    positions = np.column_stack(
        (
            cos_latitude * np.cos(longitude),
            np.sin(latitude),
            cos_latitude * np.sin(longitude),
        )
    )
    return positions / np.linalg.norm(positions, axis=1, keepdims=True)


def build_layout(
    records: Sequence[dict[str, object]], positions: np.ndarray
) -> list[dict[str, object]]:
    if len(records) != len(positions):
        raise ValueError("Sample and position counts differ")
    layout: list[dict[str, object]] = []
    for record, position in zip(records, positions, strict=True):
        layout.append(
            {
                "id": record["id"],
                "srcset": record["srcset"],
                "dominantColor": record["dominantColor"],
                "pos": {
                    "x": round(float(position[0]), 8),
                    "y": round(float(position[1]), 8),
                    "z": round(float(position[2]), 8),
                },
            }
        )
    return layout
