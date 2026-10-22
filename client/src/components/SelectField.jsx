// Labelled drop-down with an inline error message. `options` maps values to labels.
export default function SelectField({ label, name, error, options, ...selectProps }) {
  const errorId = `${name}-error`;
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        {...selectProps}
      >
        {Object.entries(options).map(([value, text]) => (
          <option key={value} value={value}>{text}</option>
        ))}
      </select>
      {error && (
        <p className="field-error" id={errorId}>
          {error}
        </p>
      )}
    </div>
  );
}
