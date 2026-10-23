import { GENDERS } from '../lib/gender';

// "Soy: Hombre / Mujer / Otro" como botones segmentados. Son radios nativos con
// name="gender": el formulario lo lee del DOM al enviar (form.gender.value), igual
// que el resto de los campos, y `required` hace que el navegador no deje seguir
// sin elegir.
export default function GenderPicker({ defaultValue }) {
  return (
    <fieldset>
      <legend className="block text-sm font-medium text-ink-soft mb-1">Soy</legend>
      <div className="grid grid-cols-3 gap-2">
        {GENDERS.map((g) => (
          <label
            key={g.id}
            className={`cursor-pointer text-center px-3 py-2.5 rounded-lg border border-edge bg-muted text-ink-soft text-sm font-medium transition hover:bg-surface has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent ${g.picked}`}
          >
            <input
              type="radio"
              name="gender"
              value={g.id}
              required
              defaultChecked={defaultValue === g.id}
              className="sr-only"
            />
            {g.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
