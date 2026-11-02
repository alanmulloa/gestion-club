# 0.8.0 Security Foundation - Setup

Copy this patch into the repository root while on:

`feat/0.8.0-sport-platform-foundation`

Then commit it and validate locally before merging to `develop`.

Local PRE gate:

```bash
supabase start
supabase db reset
supabase db lint --local --fail-on error
supabase test db --local
```

Do not merge to `develop` until all four commands are green.
