---
name: obsidian-grounded-answer
description: Retrieve read-only evidence from the user's local Obsidian knowledge base and use it as supplementary support with path-level citations. Use for substantive analysis, decisions, planning, problem solving, writing, retrospectives, data governance, project management, sales solutions, learning, and AI automation; always use when the user asks to reference Obsidian, their knowledge base, prior notes, or previous experience. Skip only when the user opts out or the bundled router classifies a self-contained low-value request.
---

# Obsidian Grounded Answer

Keep the current request, live system, code, data, and applicable standards as
the primary evidence. Use Obsidian only to add relevant personal context,
experience, examples, or prior decisions.

## Workflow

1. Check the environment before the first query in a session or after a
   retrieval error:

```bash
node <skill-dir>/scripts/check-environment.mjs
```

Stop and report exact unavailable paths when `ready` is false.

2. For a request not explicitly mentioning the knowledge base, run:

```bash
node <skill-dir>/scripts/route-query.mjs --query "<user request>"
```

Skip retrieval when `search` is false. An explicit knowledge-base request
always overrides the heuristic unless the user also explicitly opts out.

3. When retrieval is required, run:

```bash
node <skill-dir>/scripts/query-knowledge.mjs \
  --query "<complete user request>" \
  --limit 8
```

Use `--refresh` only for a forced full content-hash validation. Do not pass
`--config` or `--index`; approved paths come from
`KNOWLEDGE_SEARCH_CONFIG` and `KNOWLEDGE_SEARCH_INDEX`.

4. Treat rank as a retrieval hint. Select only evidence that materially
   supports the answer. Cite every used hit with `path`, `headingPath`, and a
   short `excerpt`.

5. Follow the evidence contract in
   [references/evidence-contract.md](references/evidence-contract.md).

## Retrieval behavior

- Maintain a separate incremental index outside the vault.
- Record SHA-256 per source and periodically perform full hash validation.
- Fuse exact/title-weighted matching, Chinese character n-gram similarity,
  synonym expansion, evidence-quality penalties, and result diversity.
- Exclude configured derived-material directories.
- Never return full chunk content from the query command.

## Boundaries

- Never write, move, rename, or delete Obsidian Markdown during retrieval.
- Never label model knowledge or an inference as knowledge-base evidence.
- Never infer absence from a non-hit.
- When sources conflict, show the conflict and source paths.
- Report command, permission, configuration, index, and JSON errors plainly.

## Evaluation

Run an auditable retrieval evaluation when ranking logic, query expansion, or
the configured roots change:

```bash
node <skill-dir>/scripts/evaluate-retrieval.mjs \
  --cases <cases.json> \
  --config "$KNOWLEDGE_SEARCH_CONFIG" \
  --index "$KNOWLEDGE_SEARCH_INDEX" \
  --top-k 3
```

Each case must contain `query` and `expectedPathPattern`. Review failed cases;
do not lower expectations merely to make the score pass.

## Maintenance

Only with explicit user authorization, install or update the Skill for Codex
and WorkBuddy:

```bash
node <skill-dir>/scripts/install-skill.mjs --yes
```

The installer is idempotent, backs up replaced files, and returns a manifest.
Roll back recoverably with:

```bash
node <skill-dir>/scripts/rollback-install.mjs \
  --manifest "<manifest path>" \
  --yes
```
