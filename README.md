# Zogal Business — back office

`ops.business.zogal.app`. The company's operator surface, replicated from zogal.app's back office
(three-gate capability model, Root as the only granter, audit, Who is told), organised as:

- **Zogal Business** — overview, marketing (site + one page per product), staff & permissions, who is told, activity, health
- **Products → Doka** — where they are (sign-in map), shops, users (linked-owner profile, message, sign in as), terminals, sync issues, finance, settings

Same Supabase project as Doka. Server reads/writes with the service role (server only); the apps' anon clients never see these tables.

Env: see `.env.example`. Migration `0016_backoffice_foundation.sql` lives in the Doka repo (`jakodav2/supabase/migrations`).
Every migration is run by Nathan in the Supabase SQL editor; nothing here writes schema.
