alter table public.listings
add column if not exists params jsonb not null default '{}'::jsonb;

create index if not exists listings_params_idx
  on public.listings
  using gin (params);

create index if not exists listings_year_idx
  on public.listings (
    (
      case
        when (params->>'year') ~ '^\d+$' then (params->>'year')::int
      end
    )
  );

create index if not exists listings_price_idx
  on public.listings (
    (
      case
        when (params->>'price') ~ '^\d+$' then (params->>'price')::int
      end
    )
  );

create index if not exists listings_mileage_idx
  on public.listings (
    (
      case
        when (params->>'mileage') ~ '^\d+$' then (params->>'mileage')::int
      end
    )
  );

create index if not exists listings_area_idx
  on public.listings (
    (
      case
        when (params->>'area_m2') ~ '^\d+$' then (params->>'area_m2')::int
      end
    )
  );
