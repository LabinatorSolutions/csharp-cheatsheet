# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## Stack

- **Framework:** Docusaurus 3 (classic preset, static output; `blog: false`, docs at `/docs`)
- **Runtime / package manager:** Bun — never npm/yarn/pnpm
- **Linter / formatter:** Biome
- **Markdown lint:** rumdl
- **Search:** `@easyops-cn/docusaurus-search-local` (index built in production only)
- **Deploy:** static `build/` (Cloudflare Pages)

Content is legacy `md` format (`markdown.format: 'detect'`) because it contains bare C# generics (`List<T>`) outside code fences that the MDX parser misreads as JSX. `onBrokenAnchors: 'ignore'` is intentional — the `md`-parser's anchor checker false-flags real, working in-page links (verified against built HTML and rumdl MD051).

## Commands

```bash
bun run start     # dev server at localhost:3000
bun run build     # production build -> build/
bun run serve     # serve the built site (search works here, not in dev)
bun run lint:fix  # Biome check + write
```

`build` runs with `--no-experimental-webstorage` in `NODE_OPTIONS`: Docusaurus's SSG renderer (the `eval` package) copies every global, which on Node 25+ trips the Web Storage getter and prints a `localStorage is not available` ExperimentalWarning. Drop the flag once Docusaurus stops enumerating globals.

## SEO & GEO

All SEO is configured centrally in `docusaurus.config.js`. Keep these in sync when the site changes:

- **`url` / `baseUrl`** — canonical origin (`https://csharp-cheatsheet.labinator.com`). Drives every canonical and sitemap URL. Keep `projectName` (`csharp-cheatsheet`) and every GitHub link matching the real repo slug — a mismatch breaks the docs "Edit this page" links.
- **`themeConfig.image`** — default social card: `static/img/og-image.png` (1280×640, brand palette, WCAG ≥9:1 text). Override per page via frontmatter `image:`. The mindmap page (`static/mindmap.html`) sets its own OG/Twitter image to `static/img/og-mindmap.png`.
- **`themeConfig.metadata`** — site-wide `description` + `keywords`. Override per page via frontmatter `description:`.
- **`headTags`** — JSON-LD `@graph` (Organization + WebSite with a sitelinks `SearchAction`). Never hand-write JSON-LD elsewhere — edit it here.
- **`static/robots.txt`** — allows search + citing AI crawlers, blocks training-only bots (GPTBot, Google-Extended, CCBot, Bytespider, Amazonbot), links `https://csharp-cheatsheet.labinator.com/sitemap.xml`. **Never set `Disallow: /`** — it delists the whole site.
- **`static/llms.txt`** — AI-discoverability map. Update its links when the references change.
- **Sitemap** — auto-generated at `/sitemap.xml` by the classic preset. Do not disable it.

Social cards are generated from SVG in the Labinator brand palette (paper `#faf8f4`, ink `#141414`, indigo `#2400ff`; bright indigo is decorative only — accent text uses `#1b00bd` to clear 9:1 on paper). Per-doc SEO: set `title`, `description`, and optionally `keywords` / `image` in frontmatter. After `bun run build`, validate JSON-LD at <https://search.google.com/test/rich-results>.
