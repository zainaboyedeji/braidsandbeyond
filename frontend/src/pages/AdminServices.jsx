import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { formatDuration, formatPrice } from '../utils/format';

const EMPTY_FORM = { name: '', description: '', durationMinutes: 30, price: '' };

export default function AdminServices() {
  const { salon } = useApp();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await api.get('/services/all');
      setServices(data.services);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function update(field) {
    return (e) => setForm((prev) => ({ ...prev, [field]: e.target.value }));
  }

  function startEdit(service) {
    setEditingId(service.id);
    setForm({
      name: service.name,
      description: service.description || '',
      durationMinutes: service.duration_minutes,
      price: (service.price_cents / 100).toFixed(2),
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    const priceCents = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setError('Enter a valid price');
      return;
    }
    const payload = {
      name: form.name,
      description: form.description,
      durationMinutes: Number(form.durationMinutes),
      priceCents,
    };

    setSaving(true);
    try {
      if (editingId) await api.patch(`/services/${editingId}`, payload);
      else await api.post('/services', payload);
      resetForm();
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(service) {
    setError('');
    try {
      await api.patch(`/services/${service.id}`, { isActive: !service.is_active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <h1>Services</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <form className="card form" onSubmit={handleSubmit}>
        <h3>{editingId ? 'Edit service' : 'Add a service'}</h3>
        <div className="form-row">
          <label>
            Name
            <input value={form.name} onChange={update('name')} required minLength={2} />
          </label>
          <label>
            Duration (minutes)
            <input
              type="number"
              min={5}
              max={480}
              step={5}
              value={form.durationMinutes}
              onChange={update('durationMinutes')}
              required
            />
          </label>
          <label>
            Price ({salon.currency})
            <input type="number" min={0} step="0.01" value={form.price} onChange={update('price')} required />
          </label>
        </div>
        <label>
          Description
          <textarea rows={2} value={form.description} onChange={update('description')} />
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add service'}
          </button>
          {editingId && (
            <button type="button" className="btn btn-ghost" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="list">
        {services.map((s) => (
          <div key={s.id} className={`card list-item ${s.is_active ? '' : 'list-item-muted'}`}>
            <div>
              <strong>{s.name}</strong> {!s.is_active && <span className="badge badge-cancelled">hidden</span>}
              <div className="muted">
                {formatDuration(s.duration_minutes)} · {formatPrice(s.price_cents, salon.currency)}
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(s)}>
                Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(s)}>
                {s.is_active ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
