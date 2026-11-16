# Contributing to kios

The changes most likely to be accepted are:

- Bug fixes
- Additional resource packs for installed Kubernetes products
- Missing standard kubectl behavior
- Terminal and environment-specific fixes
- Documentation improvements

New screens, navigation, and interaction changes need an issue and a maintainer's go-ahead before implementation. If you are unsure whether a change fits, open an issue first.

> [!NOTE]
> PRs that ignore these guardrails will likely be closed.

## Adding a resource pack

A product's custom resources belong in their own file under [`src/custom/`](./src/custom/). Register it in the `packs` list in [`src/custom/index.ts`](./src/custom/index.ts). [`src/custom/cilium.ts`](./src/custom/cilium.ts) is a small example.

The pack owns that product's resources, API versions, columns, and extra actions. Describe, YAML, and JSON come from kubectl. Delete is added for every installed resource. Packs only appear when the cluster is serving a matching CRD, so core list and watch code should stay unchanged.

Sidebar labels follow the kind rules in [`AGENTS.md`](./AGENTS.md).

## Development

kios needs [Bun](https://bun.sh) `>=1.3.5` (the `engines` field in [`package.json`](./package.json)) and a `kubectl` binary on `PATH`. `KIOS_KUBECTL` selects another binary path. It uses your current kubeconfig context. `--context` and `-n` choose a context and a namespace. From the repository root:

```bash
bun install
bun start
```

`bun start` runs the TUI. Tests do not need a cluster.

### Layout

- `src/index.tsx`: entrypoint
- `src/app.tsx`, `src/shell.tsx`: app shell and watch lifecycle
- `src/screen/`: terminal views
- `src/workspace/`: session, selection, filters, sort, and actions
- `src/cluster/`: kubectl client, lists, and watches
- `src/resources/`: built-in kinds, columns, and formatting
- `src/custom/`: optional product packs discovered from CRDs
- `scripts/`: release and the Homebrew formula

### Verification

CI runs both of these from the repository root:

```bash
bun test
bun run typecheck
```

`bun run typecheck` is `tsc --noEmit`. Tests sit next to the code they cover (`*.test.ts`, `*.test.tsx`).

Follow the repository [style guide](./AGENTS.md).

## Pull Requests

Base branches on `master`.

### Branch names

Use a short branch name of at most three words, separated by hyphens. Do not use slashes or type prefixes such as `feat/` or `fix/`.

Examples: `pod-logs`, `fix-scroll`, `namespace-filter`.

### Keep it focused

- Keep PRs small and focused.
- Explain the problem and why the change fixes it.
- Check whether the behavior already exists.
- For UI changes, include a before-and-after recording or screenshot.
- For logic changes, say what you ran and how a reviewer can verify it.
- Reference an existing issue when there is one (`Fixes #123`).

### Keep it brief

Long, AI-generated PR descriptions and issues may be ignored. Write a short explanation in your own words. If the change cannot be explained briefly, the PR may be too large.

### Use conventional titles

Use `type(scope): summary` for the PR title and for commits. Supported types are `feat`, `fix`, `docs`, `chore`, `refactor`, and `test`. The scope is optional.

Examples:

- `docs: update contributing guide`
- `fix(screen): keep selection on refresh`
- `feat(custom): add a gateway pack`

## Issues

Describe the problem first. A bug report should include what happened, what you expected, how to reproduce it, and the kios version, kubectl version, and terminal. A feature request should say why it belongs in kios before proposing a design.
