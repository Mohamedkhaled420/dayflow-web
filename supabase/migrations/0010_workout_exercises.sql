-- 0010_workout_exercises — gym-mode exercise detail on workout_logs.
-- Phase 10 (Workout enhancement, after hasaneyldrm/exercises-dataset +
-- Snouzy/workout-cool research): a workout_log can now carry the actual
-- session — exercises with sets (weight × reps, or duration seconds).
--
-- Kept as a single jsonb column (not a workout_exercises table) on
-- purpose: rows are written once per session, always read together with
-- their parent log, and never queried across users. RLS on workout_logs
-- already scopes every read/write to the owner.
--
-- Shape (src/lib/workout.ts is the contract owner):
--   [ { "id": "0294",           exercise id from bundled library
--       "n":  "pull-up",         display name (denormalized — library
--       "t":  "upper arms",      target muscle       is versioned data)
--       "e":  "body weight",     equipment
--       "s":  [ { "w": 0,        weight kg (null for bodyweight/time)
--                 "r": 10,       reps
--                 "d": null,     OR duration seconds (planks, cardio)
--                 "c": true } ]  completed
--   ]

alter table public.workout_logs
  add column if not exists exercises jsonb not null default '[]'::jsonb;

comment on column public.workout_logs.exercises is
  'Gym-mode session detail: array of {id,n,t,e,s:[{w,r,d,c}]} — see src/lib/workout.ts';
