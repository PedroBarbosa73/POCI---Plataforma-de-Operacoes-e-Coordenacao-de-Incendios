# POCI — Supabase Backend & Real-time Sync

**Date:** 2026-03-20
**Status:** Approved

## Overview

Replace the current localStorage/mock-data architecture with a Supabase backend. All state becomes persistent, multi-user, and real-time. The app is deployed to Vercel and shared via a public URL.

## Goals

- Persistent data that survives page refreshes and browser closes
- Real-time sync: changes made by one user appear on all connected clients within ~200ms
- Proper auth: Supabase Auth replaces NextAuth
- Deployable: app runs on Vercel, accessible via URL to anyone with credentials
- Migrated seed data: existing mock incidents, units, zones, alerts etc. pre-loaded into Supabase

## Out of scope

- Role-based access control (beyond authenticated vs. public)
- File/image uploads
- Push notifications
- Fire spread prediction model
- Mobile-specific layout changes

---

## Database Schema

All tables live in Supabase (PostgreSQL). All have Realtime enabled.

### `incidents`
| column | type | notes |
|---|---|---|
| id | text PK | e.g. `INC-034` |
| name | text | |
| status | text | `active`, `controlled`, `surveillance`, `resolved` |
| lat | float8 | |
| lng | float8 | |
| area | text | region name |
| type | text | `wildfire`, `flood`, etc. |
| brush_radius_km | float8 | nullable |
| wind_deg | int | nullable |
| updated_at | timestamptz | auto-updated |

### `fire_stations`
| column | type | notes |
|---|---|---|
| id | text PK | |
| name | text | |
| type | text | `voluntarios`, `sapadores`, `municipais` |
| lat | float8 | |
| lng | float8 | |

### `units`
| column | type | notes |
|---|---|---|
| id | text PK | e.g. `BV-034-01` |
| name | text | |
| type | text | `bombeiros`, `gnr`, `anepc`, `municipal`, `air`, `logistics` |
| base_lat | float8 | home position |
| base_lng | float8 | |
| station_id | text FK | references `fire_stations.id`, nullable |

### `unit_states`
| column | type | notes |
|---|---|---|
| unit_id | text PK FK | references `units.id` |
| incident_id | text FK | references `incidents.id`, nullable = unassigned |
| status | text | `available`, `assigned`, `enroute`, `onscene` |
| lat | float8 | current position, nullable |
| lng | float8 | current position, nullable |
| updated_at | timestamptz | auto-updated |

### `zones`
| column | type | notes |
|---|---|---|
| id | text PK | |
| incident_id | text FK | |
| name | text | |
| type | text | `exclusao`, `ataque`, `seguranca`, `apoio` |
| radius_km | float8 | nullable (circle zones) |
| points | jsonb | nullable (polygon zones, array of [lat,lng]) |
| created_at | timestamptz | |

### `closures`
| column | type | notes |
|---|---|---|
| id | text PK | |
| incident_id | text FK | nullable |
| name | text | |
| status | text | `active`, `resolved` |
| points | jsonb | array of [lat,lng] |
| created_at | timestamptz | |

### `alerts`
| column | type | notes |
|---|---|---|
| id | text PK | |
| incident_id | text FK | nullable |
| title | text | |
| level | text | `critical`, `high`, `medium`, `low` |
| message | text | nullable |
| radius | int | km |
| channels | jsonb | array of strings |
| status | text | `active`, `resolved` |
| created_at | timestamptz | |

### `radio_messages`
| column | type | notes |
|---|---|---|
| id | text PK | |
| incident_id | text FK | nullable |
| from_name | text | |
| message | text | |
| created_at | timestamptz | |

### `op_log`
| column | type | notes |
|---|---|---|
| id | text PK | |
| type | text | `unit_assigned`, `status_changed`, `radio_message`, `digital_order`, `alert_triggered`, etc. |
| payload | jsonb | full event data |
| incident_id | text FK | nullable |
| unit_id | text FK | nullable |
| created_at | timestamptz | |

---

## Auth

- **Provider:** Supabase Auth (email + password)
- NextAuth and `next-auth` dependency removed entirely
- `middleware.js` rewritten to check Supabase session cookie
- `useSession` calls replaced with `supabase.auth.getUser()` / `useSupabaseUser()` hook
- `signOut()` replaced with `supabase.auth.signOut()`
- Login page (`/login`) rewritten to call `supabase.auth.signInWithPassword()`
- Users managed via Supabase dashboard — no user management UI needed in the app
- Public page (`/publico`) remains unauthenticated

---

## Real-time Strategy

`usePociState` is rewritten as the central data hook:

1. **Initial load:** fetch all tables via Supabase client on mount
2. **Subscriptions:** one Supabase Realtime channel per table — INSERT/UPDATE/DELETE events update React state in place
3. **Writes:** all mutations (assign unit, change status, add alert, append log) call Supabase directly; the realtime subscription propagates the change to all clients automatically
4. **Optimistic updates:** for latency-sensitive actions (unit status, assignment), update local state immediately then confirm via Supabase

### Realtime tables
All 9 tables have `REPLICA IDENTITY FULL` set and are added to the `supabase_realtime` publication.

---

## Seed Migration

A one-time seed script (`app/scripts/seed.js`) reads from `mockData.js` and inserts all records into Supabase via the admin client. Run once after schema creation. After that, the database is the source of truth — `mockData.js` is no longer used at runtime.

Seeded data includes:
- 4 incidents (INC-034, INC-031, INC-029, INC-026)
- All fire stations
- All units with their base positions
- Unit states (assignment + status derived from mock distribution)
- Initial zones and closures
- Mock alerts
- Mock radio messages
- Op log history (seeded entries spread over last 6 hours)

---

## Deployment

1. Supabase project created at supabase.com (free tier)
2. Schema applied via Supabase SQL editor
3. Seed script run once
4. Vercel project created for `/app` directory
5. Environment variables set in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-side only)
6. Auto-deploy on git push to `main`

---

## Key Files Changed

| File | Change |
|---|---|
| `app/lib/usePociState.js` | Full rewrite — Supabase queries + realtime subscriptions |
| `app/lib/supabase.js` | New — Supabase client singleton |
| `app/middleware.js` | Rewrite — Supabase session check |
| `app/app/login/page.js` | Rewrite — Supabase auth |
| `app/app/providers.js` | Remove NextAuth provider |
| `app/app/layout.js` | Remove SessionProvider |
| `app/app/api/auth/` | Delete — no longer needed |
| `app/scripts/seed.js` | New — one-time seed migration |
| `app/package.json` | Add `@supabase/supabase-js`, remove `next-auth` |

---

## Success Criteria

- Two browser windows open on the same URL show identical map state
- Assigning a unit in one window updates the other within 200ms
- Data persists after page refresh
- Login works with Supabase credentials
- App is accessible at a public Vercel URL
- All existing features (zones, closures, alerts, radio, demo player) work unchanged
