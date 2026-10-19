BEGIN;

-- Sample services only for a brand-new database, so re-running this never brings back ones the admin removed
INSERT INTO services (name, description, duration_minutes, price_cents)
SELECT * FROM (VALUES
  ('Haircut',        'Wash, cut and style',         45,  4500),
  ('Hair Coloring',  'Full color treatment',        120, 12000),
  ('Blowout',        'Wash and blow-dry styling',   30,  3500),
  ('Manicure',       'Classic manicure',            40,  3000)
) AS v(name, description, duration_minutes, price_cents)
WHERE NOT EXISTS (SELECT 1 FROM services);

-- Open every day 09:00–18:00 by default; the admin edits these in the dashboard
INSERT INTO business_hours (weekday)
SELECT generate_series(0, 6)
ON CONFLICT (weekday) DO NOTHING;

COMMIT;
