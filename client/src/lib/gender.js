// Los ids son los que acepta el servidor (GENDERS en server/profile.js); acá van
// solo los textos para mostrarlos.
export const GENDERS = [
  { id: 'hombre', label: 'Hombre', plural: 'Hombres' },
  { id: 'mujer', label: 'Mujer', plural: 'Mujeres' },
  { id: 'otro', label: 'Otro', plural: 'Otro' },
];

export const genderLabel = (id) => GENDERS.find((g) => g.id === id)?.label;
