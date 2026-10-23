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

-- The two pickup cars with starting prices (in kobo/cents); the admin changes them in Admin → Pickup
INSERT INTO pickup_vehicles (tier, name, price_6h_cents, price_12h_cents, is_active) VALUES
  ('luxury', 'Toyota Prado 2024', 8000000, 15000000, TRUE),
  ('basic',  'Toyota Corolla',    3500000,  6000000, TRUE)
ON CONFLICT (tier) DO NOTHING;

-- Cars created before starting prices existed (still 0 and switched off): give them the same prices
UPDATE pickup_vehicles v
   SET price_6h_cents = d.p6, price_12h_cents = d.p12, is_active = TRUE
  FROM (VALUES ('luxury', 8000000, 15000000), ('basic', 3500000, 6000000)) AS d(tier, p6, p12)
 WHERE v.tier = d.tier AND v.price_6h_cents = 0 AND v.price_12h_cents = 0 AND NOT v.is_active;

COMMIT;
