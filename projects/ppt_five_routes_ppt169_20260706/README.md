# ppt_five_routes

- Canvas format: ppt169
- Created: 20260706

## Directories

- `svg_output/`: raw SVG output
- `svg_final/`: finalized SVG output
- `images/`: runtime image pool; converter assets keep their original short filenames when possible
- `icons/`: project icon set — selected library icons copied in (via icon_sync.py) plus any custom icons you add; embedded from here at export
- `notes/`: speaker notes
- `templates/`: project templates
- `live_preview/`: browser preview runtime files and history (lock.json, server.log, edits.jsonl, annotations.jsonl)
- `sources/`: source materials and normalized markdown
- `analysis/`: machine-extracted intermediate analysis (PPTX intake, image_analysis.csv) — the pipeline's canonical must-read source/asset facts
- `exports/`: main native pptx (timestamped); `_svg.pptx` sibling added with `--svg-snapshot`, `_native_charts.pptx` name with `--native-objects`
- `backup/<timestamp>/`: svg_output/ archive (always written in default-flow mode; safe to delete old timestamps)
