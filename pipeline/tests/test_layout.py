from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from pipeline.embed import (
    FALLBACK_MODEL,
    PRIMARY_MODEL,
    EmbeddingError,
    ModelUnavailable,
    OpenRouterClient,
    PaymentRequired,
    PaidLimitExceeded,
    embed_batch,
)
from pipeline.layout import build_layout, project_embeddings


class FakeClient:
    def __init__(self, fail_primary: bool = False, wrong_dimension: bool = False) -> None:
        self.fail_primary = fail_primary
        self.wrong_dimension = wrong_dimension
        self.calls: list[str] = []

    def embed_image(self, image_path: Path, model: str):
        self.calls.append(model)
        if self.fail_primary and model == PRIMARY_MODEL:
            raise ModelUnavailable("primary unavailable")
        index = int(image_path.parent.name.split("-")[-1])
        vector = [float(index), float(index % 2), 1.0]
        if self.wrong_dimension and index == 2:
            vector.append(9.0)
        return vector, 0.0, model


class FakeResponse:
    def __init__(self, status_code: int, body: dict[str, object] | None = None) -> None:
        self.status_code = status_code
        self._body = body or {}

    def json(self):
        return self._body


class SequenceSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.calls = 0

    def post(self, *_args, **_kwargs):
        response = self.responses[self.calls]
        self.calls += 1
        return response


def make_records(tmp_path: Path, count: int = 4) -> tuple[list[dict[str, object]], Path]:
    public_root = tmp_path / "public"
    records: list[dict[str, object]] = []
    for index in range(count):
        sample_id = f"sample-{index}"
        sample_dir = public_root / "samples" / sample_id
        sample_dir.mkdir(parents=True)
        Image.new("RGB", (8, 8), (index * 30, 20, 80)).save(sample_dir / "md.webp")
        records.append(
            {
                "id": sample_id,
                "srcset": {
                    "sm": f"/samples/{sample_id}/sm.webp",
                    "md": f"/samples/{sample_id}/md.webp",
                    "lg": f"/samples/{sample_id}/lg.webp",
                },
                "dominantColor": "#112233",
            }
        )
    return records, public_root


def test_primary_batch_uses_one_model_and_reuses_cache(tmp_path: Path) -> None:
    records, public_root = make_records(tmp_path)
    cache = tmp_path / "cache"
    client = FakeClient()

    first = embed_batch(records, public_root, cache, client=client, canary_size=3)
    calls_after_first = list(client.calls)
    second = embed_batch(records, public_root, cache, client=client, canary_size=3)

    assert first.model == PRIMARY_MODEL
    assert second.vectors == first.vectors
    assert client.calls == calls_after_first
    metadata = [json.loads(path.read_text()) for path in cache.rglob("*.json")]
    assert metadata
    assert {entry["model"] for entry in metadata} == {PRIMARY_MODEL}


def test_fallback_restarts_entire_batch_without_mixing_models(tmp_path: Path) -> None:
    records, public_root = make_records(tmp_path)
    client = FakeClient(fail_primary=True)

    result = embed_batch(
        records,
        public_root,
        tmp_path / "cache",
        client=client,
        canary_size=3,
        estimate_cost=lambda _model, count: count * 0.001,
        max_cost_usd=0.01,
    )

    assert result.model == FALLBACK_MODEL
    assert len(result.vectors) == len(records)
    assert client.calls.count(FALLBACK_MODEL) == len(records)
    assert set(result.vector_models.values()) == {FALLBACK_MODEL}


def test_fallback_cost_cap_stops_before_paid_batch(tmp_path: Path) -> None:
    records, public_root = make_records(tmp_path)
    client = FakeClient(fail_primary=True)

    with pytest.raises(PaidLimitExceeded):
        embed_batch(
            records,
            public_root,
            tmp_path / "cache",
            client=client,
            estimate_cost=lambda _model, _count: 0.50,
            max_cost_usd=0.45,
        )

    assert FALLBACK_MODEL not in client.calls


def test_mismatched_embedding_dimensions_fail_closed(tmp_path: Path) -> None:
    records, public_root = make_records(tmp_path)

    with pytest.raises(EmbeddingError, match="dimension"):
        embed_batch(records, public_root, tmp_path / "cache", client=FakeClient(wrong_dimension=True))


def test_openrouter_retries_only_transient_provider_errors(tmp_path: Path) -> None:
    image_path = tmp_path / "image.webp"
    Image.new("RGB", (4, 4)).save(image_path)
    session = SequenceSession(
        [
            FakeResponse(429),
            FakeResponse(529),
            FakeResponse(
                200,
                {
                    "model": PRIMARY_MODEL.removesuffix(":free"),
                    "data": [{"embedding": [0.1, 0.2]}],
                    "usage": {"cost": 0},
                },
            ),
        ]
    )
    sleeps: list[float] = []

    vector, _, _ = OpenRouterClient(
        "test-key", session=session, retries=2, sleep=sleeps.append
    ).embed_image(image_path, PRIMARY_MODEL)

    assert vector == [0.1, 0.2]
    assert session.calls == 3
    assert sleeps == [1, 2]


@pytest.mark.parametrize(
    ("status", "error_type"),
    [(401, EmbeddingError), (402, PaymentRequired)],
)
def test_openrouter_auth_and_payment_errors_do_not_retry(
    tmp_path: Path, status: int, error_type: type[Exception]
) -> None:
    image_path = tmp_path / "image.webp"
    Image.new("RGB", (4, 4)).save(image_path)
    session = SequenceSession([FakeResponse(status)])

    with pytest.raises(error_type):
        OpenRouterClient("test-key", session=session, sleep=lambda _: None).embed_image(
            image_path, PRIMARY_MODEL
        )

    assert session.calls == 1


def test_projection_is_deterministic_unit_length_and_separates_groups() -> None:
    group_a = np.array([[1.0, 0.0, value * 0.01] for value in range(8)])
    group_b = np.array([[0.0, 1.0, value * 0.01] for value in range(8)])
    vectors = np.vstack([group_a, group_b])

    first = project_embeddings(vectors, seed=17)
    second = project_embeddings(vectors, seed=17)

    assert np.allclose(first, second)
    assert np.allclose(np.linalg.norm(first, axis=1), 1.0)
    within = np.mean(np.linalg.norm(first[:8] - first[0], axis=1))
    between = np.mean(np.linalg.norm(first[8:] - first[0], axis=1))
    assert between > within


def test_build_layout_has_pre_island_contract(tmp_path: Path) -> None:
    records, _ = make_records(tmp_path, count=2)
    positions = np.array([[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]])

    layout = build_layout(records, positions)

    assert set(layout[0]) == {"id", "srcset", "dominantColor", "pos"}
    assert layout[0]["pos"] == {"x": 1.0, "y": 0.0, "z": 0.0}
