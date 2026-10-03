<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Signed-in app pages live under src/routes/_authenticated/ (client-only shell with nav + profile gate); why: one guard for auth and onboarding.
- AI calls go through src/lib/ai/gateway.server.ts and are invoked from *.functions.ts server functions; why: keep keys server-side.
- Telephony is only accessed via src/lib/callService.ts; why: the real provider is swapped in later.
