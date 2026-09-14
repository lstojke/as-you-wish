# AsYouWish

Private family wish lists with exclusive, identity-hidden reservations — so no gift gets bought twice.

## Tech Stack

- [Astro](https://astro.build/) v6 - Modern web framework with server-first rendering
- [React](https://react.dev/) v19 - UI library for interactive components
- [TypeScript](https://www.typescriptlang.org/) v5 - Type-safe JavaScript
- [Tailwind CSS](https://tailwindcss.com/) v4 - Utility-first CSS framework
- [Supabase](https://supabase.com/) - Authentication and backend-as-a-service
- [Cloudflare Workers](https://workers.cloudflare.com/) - Edge deployment runtime

## Prerequisites

- Node.js v22.14.0 (as specified in `.nvmrc`)
- npm (comes with Node.js)

## Getting Started

1. Clone the repository:

```bash
git clone https://github.com/lstojke/as-you-wish.git
cd as-you-wish
```

2. Install dependencies:

```bash
npm install
```

3. Set up Supabase and configure environment variables — see [Supabase Configuration](#supabase-configuration) below.

4. Create a `.dev.vars` file for local Cloudflare dev secrets:

```bash
cp .env.example .dev.vars
```

5. Run the development server:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` - Start development server (Cloudflare workerd runtime)
- `npm run build` - Build for production
- `npm run preview` - Preview production build
- `npm run lint` - Run ESLint with type-checked rules
- `npm run lint:fix` - Auto-fix ESLint issues
- `npm run format` - Run Prettier
- `npm test` - Run the full test suite (unit + integration)
- `npm run test:unit` - Run fast unit tests only (no services needed)
- `npm run test:integration` - Run integration tests (requires the local Supabase stack)

### Running tests

Unit tests need nothing extra:

```sh
npm run test:unit
```

Integration tests run against the local Supabase stack. Start it first, copy the
test env template, and fill it from `npx supabase status`:

```sh
npx supabase start
cp .env.test.example .env.test   # then paste Project URL + publishable/secret keys
npm run test:integration         # or `npm test` for the whole suite
```

`.env.test` is gitignored — it holds local-stack credentials only, never the
remote project values.

## Project Structure

```md
.
├── src/
│ ├── layouts/ # Astro layouts
│ ├── pages/ # Astro pages
│ │ └── api/ # API endpoints
│ ├── components/ # UI components (Astro & React)
│ └── assets/ # Static assets
├── public/ # Public assets
├── wrangler.jsonc # Cloudflare Workers config
```

## Supabase Configuration

This project uses [Supabase](https://supabase.com/) for authentication. Environment variables are declared via Astro's `astro:env` schema and are treated as **server-only secrets** — they are never exposed to the client.

### First-time setup (local, no cloud project needed)

Requires [Docker](https://www.docker.com/) and ~7 GB RAM.

1. Create your `.env` file:

```bash
cp .env.example .env
```

2. Start the local stack (downloads Docker images on first run, applies the migrations in `supabase/migrations/`):

```bash
npx supabase start
```

3. Copy the credentials printed by the CLI into your `.env` and `.dev.vars`:

```
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_KEY=<anon key from CLI output>
```

4. To stop the stack when done:

```bash
npx supabase stop
```

The local Studio UI is available at `http://localhost:54323`.

The database schema (wish lists, items, invitations, reservations, and their RLS policies) lives in `supabase/migrations/` and is applied automatically by `npx supabase start`.

### Using a cloud Supabase project instead

If you prefer to use a hosted Supabase project, add these variables to your `.env` and `.dev.vars` files:

| Variable         | Description                                                       |
| ---------------- | ----------------------------------------------------------------- |
| `SUPABASE_URL`   | Project URL from Supabase dashboard → Settings → API              |
| `SUPABASE_KEY`   | `anon` public key from Supabase dashboard → Settings → API        |
| `RESEND_API_KEY` | [Resend](https://resend.com/) API key for sending list invitations |
| `RESEND_FROM`    | From address used for invitation emails (e.g. `AsYouWish <no-reply@yourdomain>`) |

```
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_KEY=<anon-key>
RESEND_API_KEY=<resend-api-key>
RESEND_FROM=<from-address>
```

### Email confirmation in local development

By default Supabase requires email confirmation before a user can sign in. To skip this during local development:

1. Open the Supabase dashboard for your project
2. Go to **Authentication → Email → Confirm email**
3. Toggle it **off**

Users can then sign in immediately after sign-up without clicking a confirmation link.

### Auth routes

| Route                 | Description                                                             |
| --------------------- | ----------------------------------------------------------------------- |
| `/auth/signin`        | Email/password sign-in form                                             |
| `/auth/signup`        | Email/password sign-up form                                             |
| `/auth/confirm-email` | Post-signup "check your inbox" page                                     |
| `/dashboard`          | Protected home for a signed-in user (redirects to `/auth/signin` if unauthenticated) |
| `/lists/[id]`         | Protected wish-list detail page                                         |

Route protection is handled in `src/middleware.ts` (`PROTECTED_ROUTES` currently covers `/dashboard` and `/lists`). Add paths to that array to require authentication.

## Deployment

This project deploys to [Cloudflare Workers](https://workers.cloudflare.com/).

1. Build the project:

```bash
npm run build
```

2. Deploy with Wrangler:

```bash
npx wrangler deploy
```

Set `SUPABASE_URL` and `SUPABASE_KEY` as secrets in your Cloudflare dashboard or via `npx wrangler secret put`.

## CI

GitHub Actions runs lint + build on every push and PR to `master`. Configure `SUPABASE_URL` and `SUPABASE_KEY` as repository secrets in GitHub for the build step.

## License

MIT
