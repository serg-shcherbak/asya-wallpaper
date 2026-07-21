from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Mapping

import numpy as np
from dotenv import load_dotenv

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from pipeline.embed import EmbeddingClient, OpenRouterClient, embed_batch
from pipeline.islands import assign_islands, write_island_artifacts
from pipeline.layout import build_layout, project_embeddings
from pipeline.normalize import TIER_SIZES, normalize_directory
from pipeline.share import generate_share_cards


@dataclass(frozen=True)
class PipelineResult:
    sample_count: int
    island_count: int
    embedding_model: str
    cost_usd: float
    used_position_fallback: bool


def _validate_release(public_root: Path) -> tuple[list[dict[str, object]], list[dict[str, object]]]:
    layout = json.loads((public_root / "data" / "layout.json").read_text(encoding="utf-8"))
    islands = json.loads((public_root / "data" / "islands.json").read_text(encoding="utf-8"))
    island_ids = {island["id"] for island in islands}
    if not layout or not islands:
        raise ValueError("Release data must contain samples and islands")
    for sample in layout:
        if sample.get("islandId") not in island_ids:
            raise ValueError(f"Sample {sample.get('id')} references an unknown island")
        for source in sample["srcset"].values():
            if not (public_root / str(source).removeprefix("/")).exists():
                raise ValueError(f"Missing generated sample asset: {source}")
    for island_id in island_ids:
        if not (public_root / "share" / f"{island_id}.jpg").exists():
            raise ValueError(f"Missing share card for {island_id}")
    return layout, islands


def _publish_release(staged_public: Path, public_root: Path, backup_root: Path) -> None:
    public_root.mkdir(parents=True, exist_ok=True)
    installed: list[str] = []
    backed_up: list[str] = []
    try:
        for name in ("samples", "data", "share"):
            destination = public_root / name
            backup = backup_root / name
            if destination.exists():
                backup.parent.mkdir(parents=True, exist_ok=True)
                os.replace(destination, backup)
                backed_up.append(name)
            os.replace(staged_public / name, destination)
            installed.append(name)
    except Exception:
        for name in reversed(installed):
            destination = public_root / name
            if destination.is_dir():
                shutil.rmtree(destination)
            elif destination.exists():
                destination.unlink()
        for name in reversed(backed_up):
            os.replace(backup_root / name, public_root / name)
        raise


def run_pipeline(
    source_root: Path,
    public_root: Path,
    work_root: Path,
    registry_path: Path,
    *,
    client: EmbeddingClient | None = None,
    n_clusters: int | None = None,
    limit: int | None = None,
    tier_sizes: Mapping[str, int] = TIER_SIZES,
    max_cost_usd: float = 0.45,
    max_spread_radians: float = 1.05,
    seed: int = 41,
) -> PipelineResult:
    work_root.mkdir(parents=True, exist_ok=True)
    cache_root = work_root.parent / "cache"
    with tempfile.TemporaryDirectory(prefix="planetarium-build-", dir=work_root) as temporary:
        staging_root = Path(temporary)
        staged_public = staging_root / "public"
        staged_work = staging_root / "work"
        staged_registry = staging_root / "island_ids.json"
        if registry_path.exists():
            shutil.copy2(registry_path, staged_registry)

        records = normalize_directory(
            source_root,
            staged_public / "samples",
            staged_work / "samples.json",
            sizes=tier_sizes,
            limit=limit,
        )
        batch = embed_batch(
            records,
            staged_public,
            cache_root,
            client=client or OpenRouterClient(),
            max_cost_usd=max_cost_usd,
        )
        matrix = np.asarray([batch.vectors[str(record["id"])] for record in records])
        positions = project_embeddings(matrix, seed=seed)
        pre_island_layout = build_layout(records, positions)
        existing_islands_path = public_root / "data" / "islands.json"
        existing_islands = (
            json.loads(existing_islands_path.read_text(encoding="utf-8"))
            if existing_islands_path.exists()
            else []
        )
        island_build = assign_islands(
            pre_island_layout,
            batch.vectors,
            staged_registry,
            n_clusters=n_clusters,
            max_spread_radians=max_spread_radians,
            seed=seed,
            existing_islands=existing_islands,
        )
        write_island_artifacts(
            island_build,
            staged_public / "data" / "layout.json",
            staged_public / "data" / "islands.json",
        )
        generate_share_cards(
            island_build.islands,
            island_build.layout,
            staged_public,
            staged_public / "share",
        )
        _validate_release(staged_public)
        _publish_release(staged_public, public_root, staging_root / "backup")
        registry_path.parent.mkdir(parents=True, exist_ok=True)
        os.replace(staged_registry, registry_path)

    return PipelineResult(
        sample_count=len(records),
        island_count=len(island_build.islands),
        embedding_model=batch.model,
        cost_usd=batch.cost_usd,
        used_position_fallback=island_build.used_position_fallback,
    )


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description="Build the complete taste planetarium release dataset")
    parser.add_argument("--source", type=Path, default=Path("Обои"))
    parser.add_argument("--public", type=Path, default=Path("public"))
    parser.add_argument("--work", type=Path, default=Path("pipeline/out"))
    parser.add_argument("--registry", type=Path, default=Path("pipeline/island_ids.json"))
    parser.add_argument("--limit", type=int)
    parser.add_argument("--clusters", type=int)
    args = parser.parse_args()
    max_cost = float(os.getenv("OPENROUTER_MAX_COST_USD", "0.45"))
    result = run_pipeline(
        args.source,
        args.public,
        args.work,
        args.registry,
        limit=args.limit,
        n_clusters=args.clusters,
        max_cost_usd=max_cost,
    )
    print(
        f"samples={result.sample_count} islands={result.island_count} "
        f"model={result.embedding_model} cost_usd={result.cost_usd:.6f}"
    )


if __name__ == "__main__":
    main()
