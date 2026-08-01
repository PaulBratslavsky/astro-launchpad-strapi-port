# Astro × Strapi LaunchPad

An [Astro 6](https://astro.build) port of the frontend from [Strapi's LaunchPad demo](https://github.com/strapi/LaunchPad) — **Astro components and TypeScript, no React**.

This repo contains **only the frontend**. `yarn setup` fetches the LaunchPad Strapi backend for you, so there is no CMS to maintain here and no backend source in this repository.

## Requirements

- **Node.js** 20.19 or newer
- **Yarn** — `corepack enable`, or `npm i -g yarn`
- **git** — used to fetch the backend

No database to install: the backend runs on SQLite by default.

## Setup

Four commands from a clean clone to a running site.

### 1. Clone and install the orchestration scripts

```sh
git clone <this-repo>
cd astro-launchpad-strapi-port
yarn install
```

### 2. Provision everything

```sh
yarn setup
```

In order, this:

1. **Fetches the backend** into `./strapi` — a sparse checkout of only LaunchPad's `strapi/` directory at the commit pinned in `launchpad.json`, with the clone's `.git` removed.
2. **Installs dependencies** in `client/` and `strapi/`.
3. **Creates `client/.env` and `strapi/.env`**, generating a secret for every `tobemodified` placeholder, writing one shared `PREVIEW_SECRET` into both, and pointing Strapi's `CLIENT_URL` at wherever Astro actually runs.
4. **Verifies the result**, naming the file and key if anything is inconsistent.

Existing `.env` files are never overwritten, so `yarn setup` is safe to re-run.

### 3. Load the demo content

```sh
yarn seed
```

**Destructive** — Strapi's import wipes existing data first. See [Seeding data](#seeding-data).

### 4. Start it

```sh
yarn dev
```

Strapi on `:1337`, Astro on `:4321` once Strapi answers. Stopping one stops the other.

### 5. Create your admin user

The seed has content but no admin account. Open **http://localhost:1337/admin** and register — it's local to your SQLite file. Then open **http://localhost:4321**.

## Seeding data

`yarn seed` imports LaunchPad's demo content from the archive inside the fetched backend (`strapi/data/export_*.tar.gz`).

|                                         | English | French |
| --------------------------------------- | ------- | ------ |
| Pages (homepage, pricing, contact, faq) | 4       | 4      |
| Articles                                | 2       | 3      |
| Products                                | 5       | 5      |

Plus the `global` single type, the dynamic-zone content those pages reference, and 72 media assets. The import reports 1166 rows and 23.4MB, counting entities, assets, relations and configuration.

| You want to                  | Do this                                                                 |
| ---------------------------- | ----------------------------------------------------------------------- |
| Reset to the pristine demo   | `yarn seed` again                                                       |
| Start from an empty database | `rm strapi/.tmp/data.db` and restart                                    |
| Keep your own content        | don't re-run `yarn seed`; export with `cd strapi && yarn strapi export` |

Your admin account lives in the same database, so re-seeding signs you out. Seed with `yarn dev` stopped — the import rewrites the SQLite file directly.

## No React, and what that cost

LaunchPad's UI is React-first: 18 components use framer-motion, 7 use three.js through `@react-three/fiber`, and rich text renders through `@strapi/blocks-react-renderer`. None of that can come across. What replaced it:

| LaunchPad (React)               | Here                                                                 |
| ------------------------------- | -------------------------------------------------------------------- |
| `@strapi/blocks-react-renderer` | `BlocksRenderer.astro` — a recursive Astro component, zero client JS |
| framer-motion `whileInView`     | `[data-reveal]` + one IntersectionObserver for the whole page        |
| framer-motion hover/scroll      | CSS transitions, and a `data-scrolled` attribute on the navbar       |
| `react-fast-marquee`            | CSS keyframes over a duplicated, `aria-hidden` track                 |
| Radix / Headless UI accordion   | native `<details>` / `<summary>`                                     |
| `@react-three/fiber` globe      | three.js directly, lazy-loaded on scroll                             |
| `@tsparticles/react`            | `tsParticles.load()`, deferred to idle                               |
| Aceternity canvas shaders       | CSS gradients and inline SVG                                         |

**What ships to the browser on first load: two 4KB module scripts.** three.js (720KB) is a separate chunk fetched only when the globe scrolls into view, and skipped entirely for visitors who never reach it. tsparticles waits for `requestIdleCallback` and is skipped under `prefers-reduced-motion`.

Honest about the gaps: spring easing is gone, replaced by cubic-bezier transitions. The canvas-reveal shader on the feature cards is a CSS gradient. Per-element motion staggering is a `--reveal-delay` custom property rather than a physics simulation. Side by side with LaunchPad the motion reads as calmer.

## Rendering

Static by default, on-demand where it has to be:

```
prerendered   every content page, both locales — 32 pages
on-demand     /preview/[...path]
              /api/preview, /api/exit-preview
              /api/auth/{register,login,logout,me}
adapter       @astrojs/node (standalone)
```

Draft preview is the reason for the adapter: "am I previewing?" is a per-request question and cannot be answered at build time.

Draft content renders under `/preview/...` rather than at the public URL. With
`output: 'static'` the adapter serves a prerendered page straight off disk, so
middleware never sees the request and there is nothing to intercept and swap.
`/api/preview` validates the secret, sets an HttpOnly cookie, and redirects
there; `/preview/...` refuses to render without that cookie, so unpublished
content is not reachable by guessing the URL.

## Two ways to read Strapi

Both are here on purpose, because each is right for a different job.

|            | Content Layer                   | Direct fetch                    |
| ---------- | ------------------------------- | ------------------------------- |
| Where      | `src/content.config.ts`         | `src/lib/strapi.ts`             |
| When       | build time                      | build **or** request time       |
| Validation | Zod, fails the build            | TypeScript types only           |
| Draft mode | no — the build already happened | yes                             |
| Used by    | blog                            | pages, products, `/preview/...` |

The dividing line is draft preview. "What does this look like right now" cannot
be answered by content fetched at build time, so anything that has to serve
drafts fetches directly. Everything else is better off in the Content Layer.

### The Content Layer, end to end

Astro's Content Layer pulls a CMS into a local store once per build. Pages then
read typed, validated entries with `getCollection()` instead of writing fetches.
The blog is wired up this way, using
[`strapi-community-astro-loader`](https://www.npmjs.com/package/strapi-community-astro-loader).

**1. Install the loader**

```sh
yarn --cwd client add strapi-community-astro-loader
```

**2. Define collections** — `client/src/content.config.ts`

```ts
import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { strapiLoader } from 'strapi-community-astro-loader';

const clientConfig = {
  baseURL: `${import.meta.env.STRAPI_URL ?? 'http://localhost:1337'}/api`,
};

const imageSchema = z.object({
  url: z.string(),
  alternativeText: z.string().nullable().optional(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  mime: z.string().nullable().optional(),
});

const articleSchema = z.object({
  documentId: z.string(),
  title: z.string(),
  slug: z.string(),
  locale: z.string(),
  description: z.string().nullable().optional(),
  publishedAt: z.string().nullable().optional(),
  // Media and relations must be BOTH nullable and optional — Strapi omits an
  // unset relation entirely and returns null for cleared media.
  image: imageSchema.nullable().optional(),
  categories: z
    .array(z.object({ name: z.string() }))
    .nullable()
    .optional(),
  // Blocks and dynamic zones stay open; the renderers narrow them at use.
  content: z.array(z.any()).nullable().optional(),
  dynamic_zone: z.array(z.any()).nullable().optional(),
});

const articleCollection = (locale: string) =>
  defineCollection({
    loader: strapiLoader({
      contentType: 'article',
      clientConfig,
      params: { locale },
    }),
    schema: articleSchema,
  });

export const collections = {
  'articles-en': articleCollection('en'),
  'articles-fr': articleCollection('fr'),
};
```

**3. Read it in a listing page** — `client/src/pages/[locale]/blog/index.astro`

```astro
---
import { getCollection } from 'astro:content';

const { locale } = Astro.params;

const entries = await getCollection(
  locale === 'fr' ? 'articles-fr' : 'articles-en',
);

const articles = entries
  .map((entry) => entry.data)
  .sort(
    (a, b) =>
      new Date(b.publishedAt ?? 0).getTime() -
      new Date(a.publishedAt ?? 0).getTime(),
  );
---

{articles.map((article) => <ArticleCard article={article} locale={locale} />)}
```

**4. Generate detail routes from the same collections** —
`client/src/pages/[locale]/blog/[slug].astro`

```astro
---
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const [en, fr] = await Promise.all([
    getCollection('articles-en'),
    getCollection('articles-fr'),
  ]);

  return [...en, ...fr].map((entry) => ({
    params: { locale: entry.data.locale, slug: entry.data.slug },
    props: { article: entry.data },
  }));
}

const { article } = Astro.props;
---
```

One loader run now covers every locale and every article. The direct-fetch
version issued a request per locale inside `getStaticPaths`, on every page.

### Three things that cost me pages

**`locale=all` returns nothing.** Strapi 5 wants `locale=*`. `all` is not an
error — it quietly returns an empty array.

**One collection per locale, not one collection with `locale: '*'`.** Strapi 5
gives every localisation of a document the _same_ `documentId`, and the loader
keys its store on that. Fetching all locales into a single collection silently
drops translations: five API entries collapsed to three, and two pages vanished
from the build with no warning. Separate collections keep the keys in separate
namespaces.

**Populate is absent here, and that is unusual.** Most Strapi loader examples
carry a long `populate` block. LaunchPad's backend registers a populate
middleware on every API route, so a bare request already comes back fully
populated. If you point this loader at a stock Strapi project, you will need
`params.populate`.

### A dev-only wrinkle

The loader syncs asynchronously when `astro dev` starts. A request that lands
before `[content] Synced content` appears in the log sees an empty collection
and renders the "No articles yet" empty state. Reload and it is there. In
production the store is baked at build time, so this cannot happen — the build
either has the content or fails.

## Authentication

Sign-up, sign-in and sign-out against Strapi's `users-permissions` plugin,
without giving up static delivery.

Identity cannot be baked into HTML that is built once and served to everyone,
so the pages stay prerendered and the navbar asks `/api/auth/me` after load.
That is the whole trick, and it is why the auth endpoints are the only
on-demand routes involved.

| Piece                     | Where                                                                |
| ------------------------- | -------------------------------------------------------------------- |
| Session cookie            | `src/lib/session.ts` — Strapi's JWT, AES-256-GCM encrypted, HttpOnly |
| Strapi calls + validation | `src/lib/auth.ts`                                                    |
| Endpoints                 | `src/pages/api/auth/`                                                |
| Forms                     | `src/components/AuthForm.astro`, shared by both pages                |
| Navbar state              | `src/components/AuthMenu.astro`                                      |

Notes on the choices:

- **The JWT is encrypted, not just HttpOnly.** HttpOnly already keeps it away
  from page scripts; encryption means a cookie recovered from a disk backup, a
  synced profile or a proxy log is opaque rather than a usable bearer token.
  GCM authenticates too, so a tampered cookie fails to decrypt.
- **Every session read verifies against Strapi.** A decryptable cookie only
  proves this server issued it — not that the account still exists, is
  unblocked, or that the token has not expired. `/api/auth/me` asks
  `/api/users/me` and clears the cookie when Strapi says no.
- **Failed sign-in is deliberately vague.** "Incorrect email or password" for
  both a wrong password and an unknown account, so the endpoint cannot be used
  to discover which addresses are registered.
- **Logout is POST only**, so a stray `<img>` or a prefetch cannot sign someone
  out.

The tradeoff: a signed-in visitor sees an empty slot in the navbar for one
request while `/api/auth/me` resolves. Both states are hidden until the answer
arrives, which is better than flashing "Sign up" at someone who is already
signed in.

## Layout

```
launchpad.json     which LaunchPad backend to provision (pinned commit)
scripts/           setup, fetch, seed, dev, env checks
client/            the Astro app
  src/components/  UI, including blocks/ for the 12 dynamic-zone sections
  src/layouts/     BaseLayout — head, navbar, footer, preview plumbing
  src/lib/         Strapi access, media URLs, draft mode, i18n
  src/pages/       routes; api/ holds the on-demand endpoints
strapi/            fetched by `yarn setup` — gitignored, never committed
```

## Scripts

| Command                        | What it does                                                                   |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `yarn setup`                   | Fetch the backend, install both projects, reconcile `.env` files. Re-runnable. |
| `yarn setup:backend [--force]` | Just the backend fetch.                                                        |
| `yarn seed`                    | Import the demo content. **Destructive.**                                      |
| `yarn dev`                     | Strapi then Astro. Ports come from the `.env` files.                           |
| `yarn check:env`               | Verify both `.env` files agree. Runs automatically before `yarn dev`.          |
| `yarn build`                   | Production build into `client/dist`.                                           |
| `yarn check`                   | `astro check` — types across `.astro` and `.ts`.                               |

## Environment

| Variable         | Where  | Why it matters                                                                                                                                        |
| ---------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `PREVIEW_SECRET` | both   | Strapi signs preview URLs with it; the client validates them. Drift means a bare `401`. Setup writes one value to both files and re-checks every run. |
| `STRAPI_URL`     | client | Where the client reaches Strapi, at build time and per request.                                                                                       |
| `CLIENT_URL`     | strapi | Where Strapi points the preview iframe. Derived from the client's `PORT`.                                                                             |
| `PORT`           | client | Astro's dev/preview port.                                                                                                                             |

### Running alongside another LaunchPad instance

Ports come from the `.env` files, so nothing in the scripts needs editing:

```sh
# strapi/.env
PORT=1340
CLIENT_URL=http://localhost:4340

# client/.env
PORT=4340
WEBSITE_URL=http://localhost:4340
STRAPI_URL=http://localhost:1340
```

## Live preview

Strapi's admin builds a preview URL from `config/admin.ts` and points its iframe at it. `/api/preview` validates the shared secret, sets an HttpOnly cookie, and redirects. `PreviewBridge.astro` then announces readiness so the admin sends its click-to-edit overlay script, and reloads the page on save.

Redirect targets are restricted to same-origin paths — the preview URL is handed out by the admin, so an open redirect there would be a real one.

**Known limitation, inherited from Strapi:** rich text is not click-to-editable in preview. Strapi does not embed source-map markers into `blocks` fields — only strings — so there is nothing in the rendered output for the overlay to attach to. Titles and media work; article bodies do not. This affects every LaunchPad frontend, not just this one.

## Troubleshooting

**The Strapi admin spins instead of showing the login form.** A stale admin JWT from a different Strapi on the same port. Clear site data for `localhost:1337`, or use an incognito window.

**Preview says `Invalid token`.** `PREVIEW_SECRET` differs between the two `.env` files. Run `yarn check:env`, then `yarn setup` to sync, then restart — `.env` changes are not hot-reloaded.

**`yarn dev` won't start.** It runs `yarn check:env` first and refuses on an inconsistent environment. The output names each problem.

**Images 404.** Check `STRAPI_URL` in `client/.env` points at your running Strapi, including the port.

**Build warns about route `/`.** Expected. Astro's `redirectToDefaultLocale` requires `src/pages/index.astro` to exist so it can generate the `/` → `/en` redirect, then warns that its redirect supersedes that page. Removing the file breaks `astro check`.

## License

MIT
