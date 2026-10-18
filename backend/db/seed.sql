BEGIN;

INSERT INTO services (name, description, duration_minutes, price_cents) VALUES
  ('Haircut',        'Wash, cut and style',         45,  4500),
  ('Hair Coloring',  'Full color treatment',        120, 12000),
  ('Blowout',        'Wash and blow-dry styling',   30,  3500),
  ('Manicure',       'Classic manicure',            40,  3000)
ON CONFLICT (name) DO NOTHING;

COMMIT;
