# Lessons Learned

> Append-only register of recurring rules and patterns. Re-read at start by /10x-frame, /10x-research, /10x-plan, /10x-plan-review, /10x-implement, /10x-impl-review.

## Restrict user-supplied URLs to http(s) at the schema boundary

- **Context**: src/lib/schemas/wishlist.ts (and any future zod schema with a URL field)
- **Problem**: `z.url()` accepts `javascript:` and `data:` URIs. When such a URL is later rendered into `<a href={...}>`, a user can plant a stored-XSS payload visible to everyone with read access to the row.
- **Rule**: Every zod URL field validated for storage must add `.refine((u) => /^https?:\/\//i.test(u))`. Use `z.url()` raw only for transient client-side inputs that are never persisted or rendered as href.
- **Applies to**: Every `src/lib/schemas/**/*.ts` file with a URL field that will be persisted or rendered as a link.
