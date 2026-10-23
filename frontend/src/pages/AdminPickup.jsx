import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { PICKUP_TIERS } from '../utils/format';

// Prices are edited in whole currency units; the API stores cents
function toForm(vehicles) {
  return vehicles.map((v) => ({
    id: v.id,
    tier: v.tier,
    name: v.name,
    price6h: (v.price_6h_cents / 100).toFixed(2),
    price12h: (v.price_12h_cents / 100).toFixed(2),
    isActive: v.is_active,
  }));
}

export default function AdminPickup() {
  const { salon, refreshSalon } = useApp();
  const [vehicles, setVehicles] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/admin/pickup-vehicles')
      .then((data) => setVehicles(toForm(data.vehicles)))
      .catch((err) => setError(err.message));
  }, []);

  function update(id, field, value) {
    setSaved(false);
    setVehicles((prev) => prev.map((v) => (v.id === id ? { ...v, [field]: value } : v)));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    setSaving(true);
    try {
      const data = await api.put('/admin/pickup-vehicles', {
        vehicles: vehicles.map((v) => ({
          id: v.id,
          name: v.name,
          price6hCents: Math.round(Number(v.price6h) * 100),
          price12hCents: Math.round(Number(v.price12h) * 100),
          isActive: v.isActive,
        })),
      });
      setVehicles(toForm(data.vehicles));
      await refreshSalon();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Pickup</h1>
      <p className="muted">
        Customers can add a pickup to their booking for 6 or 12 hours. Only cars switched on here are offered. Price
        changes don't affect bookings already made.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Pickup options saved.</div>}

      {vehicles.length > 0 && (
        <form className="card form" onSubmit={handleSubmit}>
          {vehicles.map((v) => (
            <fieldset key={v.id} className="contact-fields">
              <legend>{PICKUP_TIERS[v.tier] || v.tier}</legend>
              <div className="form-row">
                <label>
                  Car
                  <input
                    value={v.name}
                    onChange={(e) => update(v.id, 'name', e.target.value)}
                    required
                    minLength={2}
                    maxLength={120}
                  />
                </label>
                <label>
                  6 hours ({salon.currency})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={v.price6h}
                    onChange={(e) => update(v.id, 'price6h', e.target.value)}
                    required
                  />
                </label>
                <label>
                  12 hours ({salon.currency})
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    value={v.price12h}
                    onChange={(e) => update(v.id, 'price12h', e.target.value)}
                    required
                  />
                </label>
              </div>
              <label className="pickup-toggle">
                <input
                  type="checkbox"
                  checked={v.isActive}
                  onChange={(e) => update(v.id, 'isActive', e.target.checked)}
                />
                {v.isActive ? 'Offered to customers' : 'Hidden from customers'}
              </label>
            </fieldset>
          ))}
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save pickup options'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
