#!/usr/bin/env python3
"""Validate the actual bundled engine and original artwork without third-party packages."""
import hashlib
import json
from pathlib import Path
import re
import sys

base = Path(__file__).resolve().parent.parent
web = base / "Tabboz/Web"
upstream = base / "Upstream"

manifest = json.loads((base / "Compatibility/EngineBuild.json").read_text())
for relative, expected in {**manifest["sources"], **manifest["artifacts"]}.items():
    assert hashlib.sha256((base / relative).read_bytes()).hexdigest() == expected, f"Stale engine/source: {relative}"
print(f"PASS: rebuilt engine and {len(manifest['sources'])} original-game/compatibility source inputs match build hashes")
assert (web / "zarrosim.wasm").read_bytes()[:8] == b"\0asm\x01\0\0\0"
assert sorted(json.loads((web / "audio-files.json").read_text())) == sorted(
    file.name for file in (web / "resources/wavs").glob("*.wav")
), "Audio manifest must match the original bundled clips"

dialogs = list((web / "resources/dialogs/includes").glob("*.html"))
references = set()
for dialog in dialogs:
    references.update(re.findall(r'src="([^"]+)"', dialog.read_text()))
references.update("resources/bitmaps/" + name for name in json.loads(
    (web / "resources/bitmaps/list.json").read_text())["data"])
for reference in references:
    if reference:
        assert (web / reference).is_file(), f"Missing original artwork: {reference}"
print(f"PASS: {len(dialogs)} original dialogs and {len(references)} artwork references")

original_resources = list((upstream / "resources").rglob("*"))
for original in original_resources:
    if not original.is_file():
        continue
    relative = original.relative_to(upstream)
    if str(relative) == "resources/js/novantotto.js":
        continue
    assert (web / relative).read_bytes() == original.read_bytes(), f"Changed resource: {relative}"
print("PASS: original resources unchanged except the documented compatibility fixes")

index = (web / "index.html").read_text()
assert not re.search(r'(?:src|href)="https?://', index), "External runtime dependency"
assert (base / "LICENSE").read_bytes() == (upstream / "LICENSE").read_bytes()
assert (base / "Tabboz/Resources/Assets.xcassets/AppIcon.appiconset/AppIcon.png").is_file()
print("PASS: offline entry point, license and original-art app icon")

if len(sys.argv) > 1:
    app = Path(sys.argv[1])
    for resource in web.rglob("*"):
        if resource.is_file():
            bundled = app / "Web" / resource.relative_to(web)
            assert bundled.is_file(), f"Missing from built app: {bundled}"
            assert bundled.read_bytes() == resource.read_bytes(), f"Incorrect bundle contents: {bundled}"
    assert (app / "Assets.car").is_file(), "Missing compiled app assets"
    print("PASS: every web resource and compiled asset catalog is present in the built iOS app")
