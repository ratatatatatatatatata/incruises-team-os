begin;

-- The invitation migration replaces the provisioning function, but earlier
-- installations created the auth trigger in a separate registration migration.
-- Recreate it here so clean installs cannot silently skip invite-only
-- provisioning, while preserving the invitation check inside the function.
drop trigger if exists on_auth_user_created_create_team_profile on auth.users;
create trigger on_auth_user_created_create_team_profile
after insert on auth.users
for each row execute function private.handle_new_team_user();

commit;
