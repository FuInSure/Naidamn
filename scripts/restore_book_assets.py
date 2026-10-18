"""Restore book page images from your existing Naidamn APK; no code is extracted."""
from pathlib import Path
import argparse, re, zipfile
root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('apk', type=Path)
args = parser.parse_args()
expected = {f'assets/books/{sub}/{page}.webp' for sub, count in {'ds':404,'co':340,'os':372,'net':316}.items() for page in range(1,count+1)}
with zipfile.ZipFile(args.apk) as archive:
    assert expected.issubset(archive.namelist()), 'Missing book pages'
    for name in sorted(expected):
        target = root / 'app' / name
        assert target.resolve().is_relative_to(root.resolve()), 'Unsafe destination'
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists():
            assert target.read_bytes() == archive.read(name), f'Existing different page: {name}'
        else:
            target.write_bytes(archive.read(name))
print('Restored 1432 pages to app/assets/books/')
