// Stand-in for a service with no photo yet: the B&B logo, the style name and a "coming soon" note.
// `compact` drops the name for small spots where it is already shown beside the placeholder.
export default function PhotoPlaceholder({ name, compact = false, className = '' }) {
  return (
    <div
      className={`photo-placeholder ${compact ? 'photo-placeholder-compact' : ''} ${className}`}
      role="img"
      aria-label={`${name}: photo coming soon`}
    >
      <img className="photo-placeholder-logo" src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" />
      {!compact && <span className="photo-placeholder-name">{name}</span>}
      <span className="photo-placeholder-note">Photo coming soon</span>
    </div>
  );
}
