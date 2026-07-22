from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import math
import os
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Callable, Protocol, Sequence

import requests

PRIMARY_MODEL = "nvidia/llama-nemotron-embed-vl-1b-v2:free"
FALLBACK_MODEL = "google/gemini-embedding-2"
OPENROUTER_EMBEDDINGS_URL = "https://openrouter.ai/api/v1/embeddings"
# Gemini embedding image input is priced per million image tokens, not per image.
# Normalized inputs are square and 640px by default. Google's documented image
# tiling charges four 258-token tiles for that shape, so reserve the full 1,032
# tokens before each paid request; usage metadata remains the source of actual cost.
FALLBACK_IMAGE_TOKEN_PRICE_USD = 0.00000045
FALLBACK_IMAGE_TOKEN_BOUND = 1032


class EmbeddingError(RuntimeError):
    pass


class ModelUnavailable(EmbeddingError):
    pass


class PaymentRequired(EmbeddingError):
    pass


class PaidLimitExceeded(EmbeddingError):
    pass


class EmbeddingClient(Protocol):
    def embed_image(self, image_path: Path, model: str) -> tuple[list[float], float, str]: ...


@dataclass(frozen=True)
class EmbeddingBatch:
    model: str
    vectors: dict[str, list[float]]
    vector_models: dict[str, str]
    cost_usd: float


class OpenRouterClient:
    def __init__(
        self,
        api_key: str | None = None,
        *,
        session: requests.Session | None = None,
        retries: int = 3,
        sleep: Callable[[float], None] = time.sleep,
        timeout: float = 90.0,
    ) -> None:
        self.api_key = api_key or os.getenv("OPENROUTER_API_KEY")
        if not self.api_key:
            raise EmbeddingError("OPENROUTER_API_KEY is required")
        self.session = session or requests.Session()
        self.retries = retries
        self.sleep = sleep
        self.timeout = timeout

    def embed_image(self, image_path: Path, model: str) -> tuple[list[float], float, str]:
        mime_type = mimetypes.guess_type(image_path.name)[0] or "image/webp"
        encoded = base64.b64encode(image_path.read_bytes()).decode("ascii")
        payload = {
            "model": model,
            "input": [
                {
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:{mime_type};base64,{encoded}"},
                        }
                    ]
                }
            ],
            "encoding_format": "float",
            "provider": {"allow_fallbacks": True, "data_collection": "deny"},
        }
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/serg-shcherbak/asya-wallpaper",
            "X-Title": "Asya Taste Planetarium",
        }

        response = None
        for attempt in range(self.retries + 1):
            response = self.session.post(
                OPENROUTER_EMBEDDINGS_URL,
                headers=headers,
                json=payload,
                timeout=self.timeout,
            )
            if response.status_code not in {429, 529}:
                break
            if attempt < self.retries:
                self.sleep(min(2**attempt, 8))

        assert response is not None
        if response.status_code in {404, 429, 529}:
            raise ModelUnavailable(f"Embedding model unavailable (HTTP {response.status_code})")
        if response.status_code == 401:
            raise EmbeddingError("OpenRouter rejected OPENROUTER_API_KEY (HTTP 401)")
        if response.status_code == 402:
            raise PaymentRequired("OpenRouter credits are insufficient (HTTP 402)")
        if response.status_code >= 400:
            raise EmbeddingError(f"OpenRouter embedding request failed (HTTP {response.status_code})")

        try:
            body = response.json()
            vector = body["data"][0]["embedding"]
        except (ValueError, KeyError, IndexError, TypeError) as error:
            raise EmbeddingError("OpenRouter returned an invalid embedding payload") from error
        if not isinstance(vector, list) or not vector or not all(isinstance(value, (int, float)) for value in vector):
            raise EmbeddingError("OpenRouter returned an empty or non-numeric embedding")

        response_model = str(body.get("model") or model)
        if not _same_model(response_model, model):
            raise EmbeddingError(f"OpenRouter served an unexpected embedding model: {response_model}")
        usage = body.get("usage")
        raw_cost = usage.get("cost") if isinstance(usage, dict) else None
        if _is_free_model(model):
            cost = _valid_cost(raw_cost, missing_default=0.0)
        else:
            cost = _valid_cost(raw_cost)
        return [float(value) for value in vector], cost, response_model


def _canonical_model(model: str) -> str:
    return model.removesuffix(":free")


def _same_model(response_model: str, requested_model: str) -> bool:
    requested = _canonical_model(requested_model).casefold()
    response = _canonical_model(response_model).casefold()
    return response in {requested, requested.rsplit("/", 1)[-1]}


def _is_free_model(model: str) -> bool:
    return model.casefold().endswith(":free")


def _valid_cost(value: object, *, missing_default: float | None = None) -> float:
    if value is None and missing_default is not None:
        return missing_default
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise EmbeddingError("OpenRouter returned missing or invalid usage.cost for a paid embedding")
    cost = float(value)
    if not math.isfinite(cost) or cost < 0:
        raise EmbeddingError("OpenRouter returned missing or invalid usage.cost for a paid embedding")
    return cost


def _cache_namespace(model: str) -> str:
    return model.replace("/", "--").replace(":", "--")


def _content_hash(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def estimate_fallback_cost(_model: str, count: int) -> float:
    if count < 0:
        raise ValueError("Embedding count cannot be negative")
    return FALLBACK_IMAGE_TOKEN_PRICE_USD * FALLBACK_IMAGE_TOKEN_BOUND * count


def _embedding_for_record(
    record: dict[str, object],
    public_root: Path,
    cache_root: Path,
    model: str,
    client: EmbeddingClient,
    *,
    require_observed_cost: bool,
) -> tuple[list[float], float]:
    srcset = record["srcset"]
    if not isinstance(srcset, dict) or not isinstance(srcset.get("md"), str):
        raise EmbeddingError(f"Sample {record.get('id')} has no md source")
    image_path = public_root / srcset["md"].removeprefix("/")
    digest = _content_hash(image_path)
    cache_path = cache_root / _cache_namespace(model) / f"{digest}.json"
    try:
        cached = json.loads(cache_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        cached = None
    if cached is not None:
        if cached.get("model") != model or not isinstance(cached.get("embedding"), list):
            raise EmbeddingError(f"Invalid model-keyed cache entry: {cache_path}")
        return [float(value) for value in cached["embedding"]], 0.0

    vector, cost, response_model = client.embed_image(image_path, model)
    if require_observed_cost:
        cost = _valid_cost(cost)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(
        json.dumps(
            {
                "contentHash": digest,
                "model": model,
                "responseModel": response_model,
                "embedding": vector,
            },
            separators=(",", ":"),
        )
        + "\n",
        encoding="utf-8",
    )
    return vector, cost


def _record_is_cached(
    record: dict[str, object], public_root: Path, cache_root: Path, model: str
) -> bool:
    srcset = record.get("srcset")
    if not isinstance(srcset, dict) or not isinstance(srcset.get("md"), str):
        return False
    image_path = public_root / srcset["md"].removeprefix("/")
    cache_path = cache_root / _cache_namespace(model) / f"{_content_hash(image_path)}.json"
    return cache_path.exists()


def _batch_fully_cached(
    records: Sequence[dict[str, object]],
    public_root: Path,
    cache_root: Path,
    model: str,
) -> bool:
    namespace = cache_root / _cache_namespace(model)
    if not namespace.exists():
        return False
    for record in records:
        srcset = record.get("srcset")
        if not isinstance(srcset, dict) or not isinstance(srcset.get("md"), str):
            return False
        image_path = public_root / srcset["md"].removeprefix("/")
        if not (namespace / f"{_content_hash(image_path)}.json").exists():
            return False
    return True


def _run_model_batch(
    records: Sequence[dict[str, object]],
    public_root: Path,
    cache_root: Path,
    model: str,
    client: EmbeddingClient,
    max_cost_usd: float,
    expected_dimension: int | None = None,
    paid_request_cost_bound: float | None = None,
) -> EmbeddingBatch:
    vectors: dict[str, list[float]] = {}
    total_cost = 0.0
    dimension = expected_dimension
    for record in records:
        if (
            paid_request_cost_bound is not None
            and not _record_is_cached(record, public_root, cache_root, model)
            and total_cost + paid_request_cost_bound > max_cost_usd
        ):
            raise PaidLimitExceeded(
                f"Conservative {model} request bound would exceed ${max_cost_usd:.4f} cap"
            )
        vector, cost = _embedding_for_record(
            record,
            public_root,
            cache_root,
            model,
            client,
            require_observed_cost=paid_request_cost_bound is not None,
        )
        if dimension is None:
            dimension = len(vector)
        elif len(vector) != dimension:
            raise EmbeddingError(
                f"Embedding dimension changed inside {model} batch: expected {dimension}, got {len(vector)}"
            )
        total_cost += cost
        if total_cost > max_cost_usd:
            raise PaidLimitExceeded(
                f"Observed OpenRouter cost ${total_cost:.4f} exceeded ${max_cost_usd:.4f} cap"
            )
        vectors[str(record["id"])] = vector
    return EmbeddingBatch(
        model=model,
        vectors=vectors,
        vector_models={sample_id: model for sample_id in vectors},
        cost_usd=total_cost,
    )


def _canary_then_batch(
    records: Sequence[dict[str, object]],
    public_root: Path,
    cache_root: Path,
    model: str,
    client: EmbeddingClient,
    canary_size: int,
    max_cost_usd: float,
    *,
    project_canary_cost: bool = False,
    paid_request_cost_bound: float | None = None,
) -> EmbeddingBatch:
    canary_records = records[: max(1, min(canary_size, len(records)))]
    canary = _run_model_batch(
        canary_records,
        public_root,
        cache_root,
        model,
        client,
        max_cost_usd,
        paid_request_cost_bound=paid_request_cost_bound,
    )
    if project_canary_cost and canary.cost_usd > 0:
        projected_cost = canary.cost_usd / len(canary_records) * len(records)
        if projected_cost > max_cost_usd:
            raise PaidLimitExceeded(
                f"Canary projects {model} batch at ${projected_cost:.4f}, above ${max_cost_usd:.4f} cap"
            )
    remaining_records = records[len(canary_records) :]
    if not remaining_records:
        return canary
    remaining_cap = max_cost_usd - canary.cost_usd
    canary_dimension = len(next(iter(canary.vectors.values())))
    remainder = _run_model_batch(
        remaining_records,
        public_root,
        cache_root,
        model,
        client,
        remaining_cap,
        expected_dimension=canary_dimension,
        paid_request_cost_bound=paid_request_cost_bound,
    )
    return EmbeddingBatch(
        model=remainder.model,
        vectors={**canary.vectors, **remainder.vectors},
        vector_models={**canary.vector_models, **remainder.vector_models},
        cost_usd=canary.cost_usd + remainder.cost_usd,
    )


def embed_batch(
    records: Sequence[dict[str, object]],
    public_root: Path,
    cache_root: Path,
    *,
    client: EmbeddingClient | None = None,
    primary_model: str = PRIMARY_MODEL,
    fallback_model: str = FALLBACK_MODEL,
    canary_size: int = 4,
    max_cost_usd: float = 0.45,
    estimate_cost: Callable[[str, int], float] = estimate_fallback_cost,
) -> EmbeddingBatch:
    if not records:
        raise EmbeddingError("No normalized samples were supplied")
    selected_client = client or OpenRouterClient()
    paid_fallback = not _is_free_model(fallback_model)
    fallback_request_bound = (
        estimate_fallback_cost(fallback_model, 1) if paid_fallback else None
    )

    if _batch_fully_cached(records, public_root, cache_root, fallback_model) and not _batch_fully_cached(
        records, public_root, cache_root, primary_model
    ):
        return _canary_then_batch(
            records,
            public_root,
            cache_root,
            fallback_model,
            selected_client,
            canary_size,
            max_cost_usd,
            project_canary_cost=True,
            paid_request_cost_bound=fallback_request_bound,
        )

    try:
        return _canary_then_batch(
            records,
            public_root,
            cache_root,
            primary_model,
            selected_client,
            canary_size,
            0.0,
        )
    except ModelUnavailable:
        estimate = estimate_cost(fallback_model, len(records))
        if (
            not isinstance(estimate, (int, float))
            or isinstance(estimate, bool)
            or not math.isfinite(estimate)
            or estimate < 0
        ):
            raise PaidLimitExceeded("Fallback cost estimate must be a finite non-negative number")
        if paid_fallback:
            estimate = max(estimate, estimate_fallback_cost(fallback_model, len(records)))
        if estimate > max_cost_usd:
            raise PaidLimitExceeded(
                f"Estimated {fallback_model} cost ${estimate:.4f} exceeds ${max_cost_usd:.4f} cap"
            )

    # The fallback starts from the first sample and uses a distinct namespace.
    # Primary cache entries are harmless but never enter this release batch.
    return _canary_then_batch(
        records,
        public_root,
        cache_root,
        fallback_model,
        selected_client,
        canary_size,
        max_cost_usd,
        project_canary_cost=True,
        paid_request_cost_bound=fallback_request_bound,
    )
