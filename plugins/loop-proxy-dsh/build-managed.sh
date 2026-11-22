#!/bin/sh
# Official DSH owns runtime installation and credential storage. The plugin
# artifact is portable JavaScript; native dependencies are installed by DSH.
set -eu
dest=${1:?usage: build-managed.sh /absolute/new/package}
case "$dest" in /*) ;; *) echo 'destination must be absolute' >&2; exit 2 ;; esac
[ ! -e "$dest" ] && [ ! -e "$dest.tgz" ] || { echo 'destination already exists' >&2; exit 1; }
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
mkdir -p "$(dirname "$dest")"
stage=$(mktemp -d "$(dirname "$dest")/.loop-managed.XXXXXXXX")
trap 'rm -rf "$stage"' EXIT HUP INT TERM
node "$src/build-native.mjs" "$stage/package"
COPYFILE_DISABLE=1 tar -czf "$stage/plugin.tgz" -C "$stage" package
mv "$stage/package" "$dest"
mv "$stage/plugin.tgz" "$dest.tgz"
printf 'Standalone native package: %s.tgz\n' "$dest"
