// Los ids son los que acepta el servidor (GENDERS en server/profile.js); acá van
// solo los textos para mostrarlos y el color de cada uno.
//
// `tag` es la etiqueta de la lista de conectados y `picked` el botón elegido en el
// selector "Soy": el mismo color en los dos lados. Las clases van escritas enteras
// (nada de armarlas con `bg-${color}`) porque Tailwind solo genera las que encuentra
// literales en el código. Siempre con su variante dark:, como pide el tema.
export const GENDERS = [
  {
    id: 'hombre',
    label: 'Hombre',
    plural: 'Hombres',
    tag: 'bg-sky-50 text-sky-700 dark:bg-sky-400/10 dark:text-sky-300',
    picked:
      'has-[:checked]:bg-sky-50 has-[:checked]:text-sky-700 has-[:checked]:border-sky-300 dark:has-[:checked]:bg-sky-400/10 dark:has-[:checked]:text-sky-300 dark:has-[:checked]:border-sky-400/40',
  },
  {
    id: 'mujer',
    label: 'Mujer',
    plural: 'Mujeres',
    tag: 'bg-pink-50 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300',
    picked:
      'has-[:checked]:bg-pink-50 has-[:checked]:text-pink-700 has-[:checked]:border-pink-300 dark:has-[:checked]:bg-pink-400/10 dark:has-[:checked]:text-pink-300 dark:has-[:checked]:border-pink-400/40',
  },
  {
    id: 'otro',
    label: 'Otro',
    plural: 'Otro',
    tag: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
    picked:
      'has-[:checked]:bg-violet-50 has-[:checked]:text-violet-700 has-[:checked]:border-violet-300 dark:has-[:checked]:bg-violet-400/10 dark:has-[:checked]:text-violet-300 dark:has-[:checked]:border-violet-400/40',
  },
];

export const genderInfo = (id) => GENDERS.find((g) => g.id === id);
