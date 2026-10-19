import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useApp } from '../context/AppContext';
import { WEEKDAYS } from '../utils/format';

// Show Monday first; the API still uses 0 = Sunday
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

function toForm(hours) {
  return hours.map((h) => ({ weekday: h.weekday, isOpen: h.is_open, openTime: h.open_time, closeTime: h.close_time }));
}

export default function AdminHours() {
  const { salon, refreshSalon } = useApp();
  const [days, setDays] = useState([]);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/admin/business-hours')
      .then((data) => setDays(toForm(data.hours)))
      .catch((err) => setError(err.message));
  }, []);

  function update(weekday, field, value) {
    setSaved(false);
    setDays((prev) => prev.map((d) => (d.weekday === weekday ? { ...d, [field]: value } : d)));
  }

  function copyToWeekdays(source) {
    setSaved(false);
    setDays((prev) =>
      prev.map((d) =>
        d.weekday >= 1 && d.weekday <= 5
          ? { ...d, isOpen: source.isOpen, openTime: source.openTime, closeTime: source.closeTime }
          : d
      )
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSaved(false);
    const bad = days.find((d) => d.isOpen && d.closeTime <= d.openTime);
    if (bad) {
      setError(`${WEEKDAYS[bad.weekday]}: closing time must be after opening time`);
      return;
    }

    setSaving(true);
    try {
      const data = await api.put('/admin/business-hours', { hours: days });
      setDays(toForm(data.hours));
      await refreshSalon();
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const byWeekday = Object.fromEntries(days.map((d) => [d.weekday, d]));

  return (
    <>
      <h1>Opening hours</h1>
      <p className="muted">
        Clients can only book inside these hours ({salon.timezone}). Existing appointments are not changed.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">Opening hours saved.</div>}

      {days.length > 0 && (
        <form className="card form" onSubmit={handleSubmit}>
          <div className="hours-list">
            {DISPLAY_ORDER.map((weekday) => {
              const d = byWeekday[weekday];
              return (
                <div key={weekday} className={`hours-row ${d.isOpen ? '' : 'hours-row-closed'}`}>
                  <strong className="hours-day">{WEEKDAYS[weekday]}</strong>
                  <label className="hours-toggle">
                    <input
                      type="checkbox"
                      checked={d.isOpen}
                      onChange={(e) => update(weekday, 'isOpen', e.target.checked)}
                    />
                    {d.isOpen ? 'Open' : 'Closed'}
                  </label>
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]} opening time`}
                    value={d.openTime}
                    disabled={!d.isOpen}
                    onChange={(e) => update(weekday, 'openTime', e.target.value)}
                    required
                  />
                  <span className="muted">to</span>
                  <input
                    type="time"
                    aria-label={`${WEEKDAYS[weekday]} closing time`}
                    value={d.closeTime}
                    disabled={!d.isOpen}
                    onChange={(e) => update(weekday, 'closeTime', e.target.value)}
                    required
                  />
                  {weekday === 1 && (
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyToWeekdays(d)}>
                      Copy to Mon–Fri
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save hours'}
            </button>
          </div>
        </form>
      )}
    </>
  );
}
