#!/bin/bash
set -euo pipefail

if [[ $# -ne 2 ]]; then
  echo "Použití: $0 /cesta/k/Factorio/factorio.app/Contents/data /cesta/hal-factorio-assets.tar.gz" >&2
  exit 1
fi

source_data="$1"
output_archive="$2"
if [[ ! -d "$source_data/base/graphics/icons" || ! -d "$source_data/base/locale/cs" ]]; then
  echo "Zadaná cesta neobsahuje očekávaná data Factorio." >&2
  exit 1
fi

staging_dir="$(mktemp -d)"
cleanup() { rm -rf -- "$staging_dir"; }
trap cleanup EXIT

for mod_dir in "$source_data"/*; do
  [[ -d "$mod_dir" ]] || continue
  mod_name="$(basename "$mod_dir")"
  if [[ -d "$mod_dir/graphics/icons" ]]; then
    mkdir -p "$staging_dir/$mod_name/graphics"
    cp -R "$mod_dir/graphics/icons" "$staging_dir/$mod_name/graphics/icons"
  fi
  for locale in cs en; do
    if [[ -d "$mod_dir/locale/$locale" ]]; then
      mkdir -p "$staging_dir/$mod_name/locale"
      cp -R "$mod_dir/locale/$locale" "$staging_dir/$mod_name/locale/$locale"
    fi
  done
done

mkdir -p "$(dirname "$output_archive")"
tar -C "$staging_dir" -czf "$output_archive" .
echo "Balíček vytvořen: $output_archive"
