#!/usr/bin/env python3
"""Record the shipped engine and all source inputs for offline build verification."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

base = Path(__file__).resolve().parent.parent
compiler = sys.argv[1] if len(sys.argv) > 1 else "emcc"
version = subprocess.check_output([compiler, "--version"], text=True).splitlines()[0]
names = "disco eventi lavoro proteggi readkey scooter scuola tabimg telefono tempo tipa vestiti zarrosim".split()
inputs = [base / "Upstream" / (name + ".c") for name in names]
inputs += list((base / "Upstream").glob("*.h"))
inputs += list((base / "Compatibility/Novantotto").glob("*.c"))
inputs += list((base / "Compatibility/Novantotto").glob("*.h"))
digest = lambda file: hashlib.sha256(file.read_bytes()).hexdigest()
manifest = {
    "compiler": version,
    "recipe": "Scripts/build-engine.sh",
    "sources": {str(file.relative_to(base)): digest(file) for file in sorted(inputs)},
    "artifacts": {"Tabboz/Web/" + name: digest(base / "Tabboz/Web" / name)
                  for name in ("zarrosim.js", "zarrosim.wasm")},
    "changes": "Original Tabboz C sources; corrected Novantotto child-handle cleanup, slot initialization and stable handle capacity.",
}
(base / "Compatibility/EngineBuild.json").write_text(json.dumps(manifest, indent=2) + "\n")
print("Recorded engine/source hashes in Compatibility/EngineBuild.json")
