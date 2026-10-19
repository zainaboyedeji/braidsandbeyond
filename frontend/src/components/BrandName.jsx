// Wordmark: italicises the last word ("Braids and *Beyond*") for the logo look
export default function BrandName({ name }) {
  const i = name.lastIndexOf(' ');
  if (i === -1) return <span className="brand-name">{name}</span>;
  return (
    <span className="brand-name">
      {name.slice(0, i + 1)}
      <em>{name.slice(i + 1)}</em>
    </span>
  );
}
