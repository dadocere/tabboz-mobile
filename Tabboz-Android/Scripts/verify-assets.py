#!/usr/bin/env python3
"""Check the Android bundle against shared game sources and the iOS engine manifest."""
import argparse
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile

root = Path(__file__).resolve().parents[1]
repo = root.parent
source = repo / "Tabboz-iOS/Tabboz/Web"
generated = root / "app/build/generated/gameAssets"
parser = argparse.ArgumentParser()
parser.add_argument("--apk", type=Path)
args = parser.parse_args()
archive = ZipFile(args.apk) if args.apk else None
count = 0
for file in source.rglob("*"):
    if not file.is_file():
        continue
    relative = file.relative_to(source).as_posix()
    expected = file.read_bytes()
    if relative == "index.html":
        expected = expected.replace(b'<script src="mobile.js"></script>', b'<script src="android-bridge.js"></script>\n  <script src="mobile.js"></script>')
    actual = archive.read("assets/" + relative) if archive else (generated / relative).read_bytes()
    assert actual == expected, relative
    count += 1
manifest = json.loads((repo / "Tabboz-iOS/Compatibility/EngineBuild.json").read_text())
for name, expected in manifest["artifacts"].items():
    actual = (repo / "Tabboz-iOS" / name).read_bytes()
    assert hashlib.sha256(actual).hexdigest() == expected, name
adapter = (root / "app/src/main/game/android-bridge.js").read_bytes()
assert adapter == (archive.read("assets/android-bridge.js") if archive else (generated / "android-bridge.js").read_bytes())
print(json.dumps({"status": "PASS", "shared_game_files": count, "engine_hashes_match": True, "android_adapter_matches": True}))
