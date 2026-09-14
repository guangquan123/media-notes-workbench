# Audited Windows media tools

This directory contains release inputs for the Windows customer package. Binary
files are intentionally excluded from Git and must be restored from the exact
upstream asset IDs in `tool-manifest.json` before a release build.

Run `npm run release:check -- --strict-media` after restoration. The check must
verify every file hash before packaging. Do not add Whisper, model weights, or
other local inference runtimes here; all models are external services.
