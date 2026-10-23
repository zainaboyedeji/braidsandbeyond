import { useEffect, useRef, useState } from 'react';
import { assetUrl } from '../api/client';

// Cover first, then the gallery photos
export function servicePhotoPaths(service) {
  return [service.image_path, ...(service.photos || []).map((p) => p.image_path)].filter(Boolean);
}

/**
 * Full-screen photo viewer for a service. Arrow keys / buttons / swipe move between photos, Esc closes.
 * Render it only while open; `onClose` unmounts it.
 */
export default function PhotoGallery({ title, paths, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(startIndex);
  const dialogRef = useRef(null);
  const touchX = useRef(null);
  const count = paths.length;

  // Native <dialog>: showModal() gives the backdrop, focus trapping and Esc-to-close
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);

  const go = (step) => setIndex((i) => (i + step + count) % count);

  function onKeyDown(e) {
    if (e.key === 'ArrowRight') go(1);
    if (e.key === 'ArrowLeft') go(-1);
  }

  function onTouchEnd(e) {
    if (touchX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    touchX.current = null;
  }

  return (
    <dialog
      ref={dialogRef}
      className="gallery"
      aria-label={`${title} photos`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onKeyDown={onKeyDown}
      // A click on the dark backdrop (the dialog itself, not its contents) closes it
      onClick={(e) => e.target === dialogRef.current && onClose()}
    >
      <div className="gallery-header">
        <span>
          {title}
          {count > 1 && <span className="gallery-count"> · {index + 1} of {count}</span>}
        </span>
        <button type="button" className="gallery-close" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <div
        className="gallery-stage"
        onTouchStart={(e) => {
          touchX.current = e.touches[0].clientX;
        }}
        onTouchEnd={onTouchEnd}
      >
        {count > 1 && (
          <button type="button" className="gallery-nav gallery-prev" aria-label="Previous photo" onClick={() => go(-1)}>
            ‹
          </button>
        )}
        <img src={assetUrl(paths[index])} alt={`${title}, photo ${index + 1} of ${count}`} />
        {count > 1 && (
          <button type="button" className="gallery-nav gallery-next" aria-label="Next photo" onClick={() => go(1)}>
            ›
          </button>
        )}
      </div>
      {count > 1 && (
        <div className="gallery-thumbs">
          {paths.map((p, i) => (
            <button
              type="button"
              key={p}
              className={i === index ? 'active' : ''}
              onClick={() => setIndex(i)}
              aria-label={`Photo ${i + 1}`}
              aria-current={i === index}
            >
              <img src={assetUrl(p)} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </dialog>
  );
}
