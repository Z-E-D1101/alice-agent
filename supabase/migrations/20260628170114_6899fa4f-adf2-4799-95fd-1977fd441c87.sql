CREATE TABLE public.app_state (
  id text PRIMARY KEY DEFAULT 'default',
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_state TO authenticated;
GRANT ALL ON public.app_state TO service_role;

ALTER TABLE public.app_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read app_state" ON public.app_state FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Public insert app_state" ON public.app_state FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Public update app_state" ON public.app_state FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

INSERT INTO public.app_state (id, data) VALUES ('default', '{}'::jsonb) ON CONFLICT (id) DO NOTHING;