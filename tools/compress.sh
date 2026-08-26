#!/usr/bin/env bash
# Squeeze a raw GLB down to something a college laptop can stream.
#
#   ./tools/compress.sh raw.glb assets/models/plaza.glb [texture_size]
#
# Default texture size is 1024, which is plenty for a plaza seen from a
# fixed camera. Pass 2048 if it looks soft.

set -euo pipefail

IN="${1:?usage: compress.sh <in.glb> <out.glb> [texture_size]}"
OUT="${2:?usage: compress.sh <in.glb> <out.glb> [texture_size]}"
TEXSIZE="${3:-1024}"

GT="npx --yes @gltf-transform/cli@latest"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

say() { printf '\n\033[36m▸ %s\033[0m\n' "$1"; }
size() { du -h "$1" | cut -f1; }

say "input: $(size "$IN")"

# 1. Throw away everything nothing references, and merge duplicates.
say "pruning unused data"
$GT prune "$IN" "$TMP/1.glb"

say "deduplicating meshes, materials and textures"
$GT dedup "$TMP/1.glb" "$TMP/2.glb"

# 2. Flatten the scene graph and join meshes that share a material.
#    Fewer draw calls is the single biggest win for weak integrated GPUs.
say "flattening scene graph"
$GT flatten "$TMP/2.glb" "$TMP/3.glb"

say "joining meshes by material (fewer draw calls)"
$GT join "$TMP/3.glb" "$TMP/4.glb"

# 3. Textures: resize then re-encode to WebP. Usually the biggest byte saving.
say "resizing textures to ${TEXSIZE}px"
$GT resize "$TMP/4.glb" "$TMP/5.glb" --width "$TEXSIZE" --height "$TEXSIZE"

say "re-encoding textures to WebP"
$GT webp "$TMP/5.glb" "$TMP/6.glb" --quality 82

# 4. Geometry: weld vertices, then Meshopt-compress.
#    Meshopt decodes far faster than Draco, which matters on slow CPUs.
say "welding vertices"
$GT weld "$TMP/6.glb" "$TMP/7.glb"

say "applying Meshopt compression"
$GT meshopt "$TMP/7.glb" "$OUT" --level high

say "output: $(size "$OUT")"
echo
$GT inspect "$OUT" | head -40
