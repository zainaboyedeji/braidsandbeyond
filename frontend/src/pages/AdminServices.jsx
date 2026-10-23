import { useEffect, useRef, useState } from 'react';
import { api, assetUrl } from '../api/client';
import { useApp } from '../context/AppContext';
import { formatDuration, formatPrice } from '../utils/format';

const EMPTY_FORM = { name: '', description: '', durationMinutes: 30, price: '' };
const MAX_IMAGE_MB = 5;
const MAX_GALLERY_PHOTOS = 12;
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export default function AdminServices() {
  const { salon } = useApp();
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [currentImage, setCurrentImage] = useState(null);
  const [photos, setPhotos] = useState([]);
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

  async function addPhotos(e) {
    const files = [...e.target.files];
    e.target.value = '';
    if (files.length === 0) return;
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) {
      setFormError('Photos must be JPG, PNG or WebP files');
      return;
    }
    if (files.some((f) => f.size > MAX_IMAGE_MB * 1024 * 1024)) {
      setFormError(`Each photo must be under ${MAX_IMAGE_MB} MB`);
      return;
    }
    if (photos.length + files.length > MAX_GALLERY_PHOTOS) {
      setFormError(`A service can have up to ${MAX_GALLERY_PHOTOS} gallery photos (it has ${photos.length}).`);
      return;
    }
    const formData = new FormData();
    files.forEach((f) => formData.append('photos', f));
    setFormError('');
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
    const priceCents = Math.round(Number(form.price) * 100);
    if (!Number.isFinite(priceCents) || priceCents < 0) {
      setFormError('Enter a valid price');
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
      const data = editingId
        ? await api.patch(`/services/${editingId}`, payload)
        : await api.post('/services', payload);
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
      closeModal();
      await load();
    } catch (err) {
      setFormError(err.message);
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
      <div className="page-header">
        <h1>Services</h1>
        <button type="button" className="btn btn-primary" onClick={openAdd}>
          + Add service
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}

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
              Gallery <span className="muted">({photos.length} of {MAX_GALLERY_PHOTOS} photos)</span>
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
              <p className="muted small">Save the service first, then edit it to add gallery photos.</p>
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
