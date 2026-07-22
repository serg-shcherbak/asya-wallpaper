from __future__ import annotations

from pathlib import Path

from PIL import Image

from pipeline.share import generate_share_cards


def test_generates_one_metadata_free_card_per_island_and_removes_stale(tmp_path: Path) -> None:
    public_root = tmp_path / "public"
    samples = []
    for index in range(4):
        sample_id = f"sample-{index}"
        sample_dir = public_root / "samples" / sample_id
        sample_dir.mkdir(parents=True)
        Image.new("RGB", (40, 40), (30 + index * 40, 80, 120)).save(sample_dir / "md.webp")
        samples.append(
            {
                "id": sample_id,
                "srcset": {"md": f"/samples/{sample_id}/md.webp"},
                "islandId": "island-a" if index < 2 else "island-b",
            }
        )
    islands = [
        {"id": "island-a", "name": "Остров 01", "color": "#8e5267"},
        {"id": "island-b", "name": "Остров 02", "color": "#334f71"},
    ]
    share_root = public_root / "share"
    share_root.mkdir(parents=True)
    (share_root / "stale.jpg").write_bytes(b"stale")

    first = generate_share_cards(islands, samples, public_root, share_root, size=(320, 168))
    second = generate_share_cards(islands, samples, public_root, share_root, size=(320, 168))

    assert first == second
    assert {path.name for path in share_root.glob("*.jpg")} == {"island-a.jpg", "island-b.jpg"}
    with Image.open(first[0]) as image:
        assert image.size == (320, 168)
        assert image.format == "JPEG"
        assert not image.getexif()

