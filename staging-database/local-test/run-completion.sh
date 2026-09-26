#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
runner=(npm)
if [[ -n "${npm_execpath:-}" ]]; then
 runner=(node "$npm_execpath")
fi
"${runner[@]}" run test:completion:base
"${runner[@]}" run test:manager-contract-workflow
"${runner[@]}" run test:template-library
