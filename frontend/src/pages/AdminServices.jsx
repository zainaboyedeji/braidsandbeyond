import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api/client';
import { useApp } from '../context/AppContext';
import { serviceDuration, servicePrice } from '../utils/format';

const EMPTY_FORM = { name: '', description: '', durationMinutes: 30, price: '' };
const MAX_IMAGE_MB = 5;
const MAX_GALLERY_PHOTOS = 12;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

let nextVariantKey = 1;
const newVariantRow = (v = {}) => ({
  key: nextVariantKey++,
  id: v.id ?? null,
  name: v.name ?? '',
  durationMinutes: v.duration_minutes ?? 60,
  price: v.price_cents !== undefined ? (v.price_cents / 100).toFixed(2) : '',
});

export default function AdminServices() {
  const { salon } = useApp();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [photos, setPhotos] = useState([]);
  // Gallery photos picked while adding a new service: previewed now, uploaded once the service is saved
  const [pendingPhotos, setPendingPhotos] = useState([]);
  const [variantRows, setVariantRows] = useState([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const fileInput = useRef(null);
  const dialogRef = useRef(null);

  // Native <dialog>: showModal() gives the backdrop, focus trapping and Esc-to-close
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (modalOpen && !dialog.open) dialog.showModal();
    if (!modalOpen && dialog.open) dialog.close();
  }, [modalOpen]);

  // Free the object URL when the preview changes or the page unmounts
  useEffect(() => () => imagePreview && URL.revokeObjectURL(imagePreview), [imagePreview]);

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

  function chooseImage(e) {
    const file = e.target.files[0];
    if (!file) return;
    if (!IMAGE_TYPES.includes(file.type)) {
      setFormError('Image must be a JPG, PNG or WebP file');
      e.target.value = '';
      return;
    }
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      setFormError(`Image must be under ${MAX_IMAGE_MB} MB`);
      e.target.value = '';
      return;
    }
    setFormError('');
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  function clearChosenImage() {
    setImageFile(null);
    setImagePreview(null);
    if (fileInput.current) fileInput.current.value = '';
  }

  async function removeCurrentImage() {
    setFormError('');
    try {
      await api.del(`/services/${editingId}/image`);
      setCurrentImage(null);
      await load();
    } catch (err) {
      setFormError(err.message);
    }
  }

  function updateVariant(key, field, value) {
    setVariantRows((rows) => rows.map((r) => (r.key === key ? { ...r, [field]: value } : r)));
  }

  async function addPhotos(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length === 0) return;
    const existing = editingId ? photos.length : pendingPhotos.length;
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) {
      setFormError('Photos must be JPG, PNG or WebP files');
      return;
    }
    if (files.some((f) => f.size > MAX_IMAGE_MB * 1024 * 1024)) {
      setFormError(`Each photo must be under ${MAX_IMAGE_MB} MB`);
      return;
    }
    if (existing + files.length > MAX_GALLERY_PHOTOS) {
      setFormError(`A service can have up to ${MAX_GALLERY_PHOTOS} gallery photos (it has ${existing}).`);
      return;
    }
    setFormError('');

    // New service: keep them until it's saved
    if (!editingId) {
      setPendingPhotos((prev) => [
        ...prev,
        ...files.map((file) => ({ key: nextVariantKey++, file, url: URL.createObjectURL(file) })),
      ]);
      return;
    }

    const formData = new FormData();
    files.forEach((f) => formData.append('photos', f));
    setPhotoBusy(true);
    try {
      const data = await api.upload(`/services/${editingId}/photos`, formData);
      setPhotos(data.photos);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePendingPhoto(key) {
    setPendingPhotos((prev) => {
      const photo = prev.find((p) => p.key === key);
      if (photo) URL.revokeObjectURL(photo.url);
      return prev.filter((p) => p.key !== key);
    });
  }

  function clearPendingPhotos() {
    setPendingPhotos((prev) => {
      prev.forEach((p) => URL.revokeObjectURL(p.url));
      return [];
    });
  }

  async function removePhoto(photo) {
    setFormError('');
    setPhotoBusy(true);
    try {
      const data = await api.del(`/services/${editingId}/photos/${photo.id}`);
      setPhotos(data.photos);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function makeCover(photo) {
    setFormError('');
    setPhotoBusy(true);
    try {
      const data = await api.post(`/services/${editingId}/photos/${photo.id}/cover`);
      setPhotos(data.photos);
      setCurrentImage(data.service.image_path);
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setPhotoBusy(false);
    }
  }

  function startEdit(service) {
    setEditingId(service.id);
    setCurrentImage(service.image_path);
    setPhotos(service.photos || []);
    setVariantRows((service.variants || []).map((v) => newVariantRow(v)));
    clearChosenImage();
    setForm({
      name: service.name,
      description: service.description || '',
      durationMinutes: service.duration_minutes,
      price: (service.price_cents / 100).toFixed(2),
    });
    setFormError('');
    setModalOpen(true);
  }

  function openAdd() {
    resetForm();
    setModalOpen(true);
  }

  function resetForm() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setCurrentImage(null);
    setPhotos([]);
    clearPendingPhotos();
    setVariantRows([]);
    setFormError('');
    clearChosenImage();
  }

  function closeModal() {
    setModalOpen(false);
    resetForm();
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setFormError('');
    const variants = variantRows.map((row) => ({
      id: row.id ?? undefined,
      name: row.name,
      durationMinutes: Number(row.durationMinutes),
      priceCents: Math.round(Number(row.price) * 100),
    }));
    const badVariant = variants.find((v) => !Number.isFinite(v.priceCents) || v.priceCents < 0);
    if (badVariant) {
      setFormError(`Enter a valid price for "${badVariant.name || 'each option'}"`);
      return;
    }
    // With options, the service's own length and price fields are hidden: store its shortest
    // length and lowest price so it still has sensible values
    const priceCents =
      variants.length > 0 ? Math.min(...variants.map((v) => v.priceCents)) : Math.round(Number(form.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFormError('Enter a valid price');
      return;
    }
    const payload = {
      name: form.name,
      description: form.description,
      durationMinutes:
        variants.length > 0 ? Math.min(...variants.map((v) => v.durationMinutes)) : Number(form.durationMinutes),
      priceCents,
    };

    setSaving(true);
    try {
      const data = editingId
        ? await api.patch(`/services/${editingId}`, payload)
        : await api.post('/services', payload);
      if (editingId || variants.length > 0) {
        try {
          await api.put(`/services/${data.service.id}/variants`, { variants });
        } catch (err) {
          // Details were saved; reopen on this service so the options can be fixed
          await load();
          startEdit({ ...data.service, photos });
          setVariantRows(variantRows);
          setFormError(`Service saved, but the options weren't: ${err.message}`);
          return;
        }
      }
      if (imageFile) {
        const formData = new FormData();
        formData.append('image', imageFile);
        try {
          await api.upload(`/services/${data.service.id}/image`, formData);
        } catch (err) {
          // Details were saved; keep the form open on this service so the image can be retried
          startEdit(data.service);
          await load();
          setFormError(`Service saved, but the image upload failed: ${err.message}`);
          return;
        }
      }
      if (pendingPhotos.length > 0) {
        const formData = new FormData();
        pendingPhotos.forEach((p) => formData.append('photos', p.file));
        try {
          await api.upload(`/services/${data.service.id}/photos`, formData);
        } catch (err) {
          // Service saved; reopen it in edit mode, where the gallery can be added to again
          await load();
          startEdit(data.service);
          clearPendingPhotos();
          setFormError(`Service saved, but the gallery photos didn't upload: ${err.message}. Please add them again.`);
          return;
        }
      }
      closeModal();
      await load();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(service) {
    const ok = window.confirm(
      `Delete "${service.name}"? It will be removed from the website and this list. This can't be undone.`
    );
    if (!ok) return;
    setError('');
    setNotice('');
    try {
      const data = await api.del(`/services/${service.id}`);
      setNotice(
        data.deleted === 'archived'
          ? `"${service.name}" was deleted. Past bookings for it still show in your records.`
          : `"${service.name}" was deleted.`
      );
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function toggleActive(service) {
    setError('');
    setNotice('');
    try {
      await api.patch(`/services/${service.id}`, { isActive: !service.is_active });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="page-header">
        <h1>Services</h1>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          + Add service
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {notice && <div className="alert alert-success">{notice}</div>}

      {/* onCancel fires on Esc; route it through closeModal so React state stays in sync */}
      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="service-modal-title"
        onCancel={(e) => {
          e.preventDefault();
          if (!saving) closeModal();
        }}
      >
        <form className="form" onSubmit={handleSubmit}>
          <div className="modal-header">
            <h3 id="service-modal-title">{editingId ? 'Edit service' : 'Add a service'}</h3>
            <button type="button" className="modal-close" aria-label="Close" onClick={closeModal} disabled={saving}>
              ×
            </button>
          </div>
          {formError && <div className="alert alert-error">{formError}</div>}
          <div className="form-row">
            <label>
              Name
              <input value={form.name} onChange={update('name')} required minLength={2} />
            </label>
            {/* A service with options takes its length and price from each option instead */}
            {variantRows.length === 0 && (
              <>
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
              </>
            )}
          </div>
          <label>
            Description
            <textarea rows={2} value={form.description} onChange={update('description')} />
          </label>
          <fieldset className="gallery-field">
            <legend>
              Options <span className="muted">(e.g. Small, Medium, Large)</span>
            </legend>
            {variantRows.length > 0 && (
              <div className="variant-rows">
                <div className="variant-row variant-row-head" aria-hidden="true">
                  <span>Name</span>
                  <span>Minutes</span>
                  <span>Price ({salon.currency})</span>
                  <span />
                </div>
                {variantRows.map((row) => (
                  <div key={row.key} className="variant-row">
                    <input
                      value={row.name}
                      onChange={(e) => updateVariant(row.key, 'name', e.target.value)}
                      placeholder="e.g. Medium"
                      aria-label="Option name"
                      maxLength={60}
                      required
                    />
                    <input
                      type="number"
                      min={5}
                      max={480}
                      step={5}
                      value={row.durationMinutes}
                      onChange={(e) => updateVariant(row.key, 'durationMinutes', e.target.value)}
                      aria-label="Option duration in minutes"
                      required
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={row.price}
                      onChange={(e) => updateVariant(row.key, 'price', e.target.value)}
                      aria-label="Option price"
                      required
                    />
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => setVariantRows((rows) => rows.filter((r) => r.key !== row.key))}
                      aria-label={`Remove ${row.name || 'option'}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => setVariantRows((rows) => [...rows, newVariantRow()])}
            >
              + Add option
            </button>
            <p className="muted small">
              {variantRows.length > 0
                ? 'Clients choose one of these when booking, each with its own length and price.'
                : 'Leave empty if this service only comes one way. Adding options replaces the duration and price above.'}
            </p>
          </fieldset>
          <div className="image-field">
            {(imagePreview || currentImage) && (
              <img className="image-field-preview" src={imagePreview || assetUrl(currentImage)} alt="Service" />
            )}
            <div className="form">
              <label>
                Cover photo <span className="muted">(JPG, PNG or WebP, up to {MAX_IMAGE_MB} MB)</span>
                <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={chooseImage} />
              </label>
              <div className="actions">
                {imageFile && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={clearChosenImage}>
                    Don't use this photo
                  </button>
                )}
                {!imageFile && currentImage && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={removeCurrentImage}>
                    Remove current photo
                  </button>
                )}
              </div>
            </div>
          </div>
          <fieldset className="gallery-field">
            <legend>
              Gallery{' '}
              <span className="muted">
                ({editingId ? photos.length : pendingPhotos.length} of {MAX_GALLERY_PHOTOS} photos)
              </span>
            </legend>
            {editingId ? (
              <>
                {photos.length > 0 && (
                  <div className="gallery-admin">
                    {photos.map((p) => (
                      <figure key={p.id}>
                        <img src={assetUrl(p.image_path)} alt="" />
                        <figcaption>
                          <button type="button" onClick={() => makeCover(p)} disabled={photoBusy}>
                            Make cover
                          </button>
                          <button
                            type="button"
                            onClick={() => removePhoto(p)}
                            disabled={photoBusy}
                            aria-label="Remove photo"
                          >
                            Remove
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {photos.length < MAX_GALLERY_PHOTOS && (
                  <label className="btn btn-outline btn-sm gallery-add">
                    {photoBusy ? 'Uploading…' : '+ Add photos'}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={addPhotos}
                      disabled={photoBusy}
                      hidden
                    />
                  </label>
                )}
                <p className="muted small">Clients see these after the cover when they tap the service's photo.</p>
              </>
            ) : (
              <>
                {pendingPhotos.length > 0 && (
                  <div className="gallery-admin">
                    {pendingPhotos.map((p) => (
                      <figure key={p.key}>
                        <img src={p.url} alt="" />
                        <figcaption>
                          <button
                            type="button"
                            onClick={() => removePendingPhoto(p.key)}
                            disabled={saving}
                            aria-label="Remove photo"
                          >
                            Remove
                          </button>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}
                {pendingPhotos.length < MAX_GALLERY_PHOTOS && (
                  <label className="btn btn-outline btn-sm gallery-add">
                    + Add photos
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      multiple
                      onChange={addPhotos}
                      disabled={saving}
                      hidden
                    />
                  </label>
                )}
                <p className="muted small">
                  Clients see these after the cover when they tap the service's photo. They upload when you save.
                </p>
              </>
            )}
          </fieldset>
          <div className="actions">
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save changes' : 'Add service'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={closeModal} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      </dialog>

      <div className="list">
        {services.map((s) => (
          <div key={s.id} className={`card list-item ${s.is_active ? '' : 'list-item-muted'}`}>
            <div className="service-thumb-wrap">
              {s.image_path ? (
                <img className="service-thumb" src={assetUrl(s.image_path)} alt="" />
              ) : (
                <div className="service-thumb service-thumb-empty">No photo</div>
              )}
              {s.photos?.length > 0 && <span className="photo-count">+{s.photos.length}</span>}
            </div>
            <div className="list-item-body">
              <strong>{s.name}</strong> {!s.is_active && <span className="badge badge-cancelled">hidden</span>}
              <div className="muted">
                {serviceDuration(s)} · {servicePrice(s, salon.currency)}
                {s.variants?.length > 0 && ` · ${s.variants.length} options`}
              </div>
            </div>
            <div className="actions">
              <button type="button" className="btn btn-outline btn-sm" onClick={() => startEdit(s)}>
                Edit
              </button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggleActive(s)}>
                {s.is_active ? 'Hide' : 'Show'}
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => deleteService(s)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
