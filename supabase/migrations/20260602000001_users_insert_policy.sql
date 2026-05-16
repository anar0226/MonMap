-- The initial schema enabled RLS on public.users with select/update-own
-- policies but never added an INSERT policy. The handle_new_user() trigger
-- uses security definer so it bypasses RLS, but any client-side fallback
-- (e.g. upsert from VerifyOtpScreen / CompleteProfileScreen for phone signups
-- where the trigger missed) silently failed. Allow users to insert their own
-- row so the app can self-heal when the trigger doesn't populate the mirror.

drop policy if exists "users: insert own" on public.users;
create policy "users: insert own"
  on public.users for insert
  with check (auth.uid() = id);
