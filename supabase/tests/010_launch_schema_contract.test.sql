begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(6);

select has_function(
  'public',
  'insuccess_schema_contract',
  array[]::text[],
  'The final launch schema contract RPC exists'
);
select is(
  has_function_privilege('anon', 'public.insuccess_schema_contract()', 'EXECUTE'),
  false,
  'Anonymous clients cannot read the launch schema contract'
);
select is(
  has_function_privilege('authenticated', 'public.insuccess_schema_contract()', 'EXECUTE'),
  false,
  'Authenticated browser clients cannot read the launch schema contract'
);
select is(
  has_function_privilege('service_role', 'public.insuccess_schema_contract()', 'EXECUTE'),
  true,
  'Only the server service role may read the launch schema contract'
);
select is(
  (select prosecdef from pg_proc where oid = 'public.insuccess_schema_contract()'::regprocedure),
  false,
  'The data-free launch schema contract is security invoker'
);

set local role service_role;
select is(
  public.insuccess_schema_contract(),
  'insuccess-personal-ai-v1-20260906',
  'The database returns the exact application release contract'
);
reset role;

select * from finish();
rollback;
