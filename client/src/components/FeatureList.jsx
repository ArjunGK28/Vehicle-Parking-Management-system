import { Link } from 'react-router-dom';

// Grid of the features a role can use. Items without `ready` show as coming soon
// until their story is built; ready items with `to` link to their page.
export default function FeatureList({ title, features }) {
  return (
    <section className="panel">
      <h2>{title}</h2>
      <ul className="feature-list">
        {features.map((f) => (
          <li key={f.name} className={f.ready ? '' : 'feature-soon'}>
            <strong>{f.ready && f.to ? <Link to={f.to}>{f.name}</Link> : f.name}</strong>
            <span className="muted">{f.ready ? f.description : `${f.description} (coming soon)`}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
