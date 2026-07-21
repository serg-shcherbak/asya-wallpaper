# Taste planetarium pipeline

The pipeline turns the local `Обои/` source directory into one versioned static release: normalized WebP samples, spherical positions, stable islands, and share cards. Raw images, embedding caches, and API keys stay local.

## Setup

Use Python 3.11, then install the pinned dependencies:

```bash
python3.11 -m venv .venv
.venv/bin/pip install -r pipeline/requirements.txt
```

Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`. The primary model is `nvidia/llama-nemotron-embed-vl-1b-v2:free`; an unavailable primary causes a whole-batch restart with `google/gemini-embedding-2`. A release never mixes model spaces. Paid fallback is guarded by `OPENROUTER_MAX_COST_USD` (default `0.45`), a canary projection, observed usage, and a model-keyed cache.

## Build

Run the complete local dataset:

```bash
.venv/bin/python pipeline/run.py
```

Use `--limit 24` for a small visual canary and `--clusters 6` to tune the island count. The command builds in a staging directory, validates references, then swaps `public/samples`, `public/data`, and `public/share` together. A failed build keeps the last valid public release.

Generated release files are committed; local inputs and intermediate state are not:

- `public/samples/<sample-id>/{sm,md,lg}.webp`
- `public/data/layout.json`
- `public/data/islands.json`
- `public/share/<island-id>.jpg`
- `pipeline/island_ids.json` (stable URL anchor registry)
- `pipeline/cache/` and `pipeline/out/` (ignored local state)

## Curate names safely

Edit only the `name` field in `public/data/islands.json` after Asya names the islands. The next rebuild preserves names by stable island id. Do not rename ids or anchors manually: a missing or ambiguous anchor intentionally stops publication so existing `/result/<island-id>` links cannot silently change meaning.

Regeneration is a release event. Review the visual neighbourhoods and island contours, then commit all four generated surfaces (`samples`, `layout.json`, `islands.json`, `share`) together.
