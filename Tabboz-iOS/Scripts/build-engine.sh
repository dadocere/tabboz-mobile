#!/bin/bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
emcc_bin="${EMCC:-emcc}"
sources=()
for name in disco eventi lavoro proteggi readkey scooter scuola tabimg telefono tempo tipa vestiti zarrosim; do
  sources+=("$project_dir/Upstream/$name.c")
done
sources+=("$project_dir"/Compatibility/Novantotto/*.c)
"$emcc_bin" "${sources[@]}" -o "$project_dir/Tabboz/Web/zarrosim.js" \
  -I "$project_dir/Compatibility/Novantotto" \
  -s ASYNCIFY -s GLOBAL_BASE=66536 -s ASSERTIONS=2 -s SAFE_HEAP=1 \
  -s STACK_OVERFLOW_CHECK=2 -s DEMANGLE_SUPPORT=1 \
  -s 'ASYNCIFY_IMPORTS=["emscripten_asm_const_int"]' \
  -s 'EXPORTED_RUNTIME_METHODS=["ccall","setValue"]' \
  -s 'EXPORTED_FUNCTIONS=["_main","_GetDlgItem","_PostMessage","_PrintMessages","_AllocateControl","_GetTickCount","_WinMainStartup","_GetLiveHandleCount"]'
python3 "$project_dir/Scripts/write-engine-manifest.py" "$emcc_bin"
