// El fantasmita del favicon (client/public/favicon.svg) sin el cuadrado de fondo:
// mismo dibujo, para usarlo de mascota en la homepage. Va en blanco con ojos
// oscuros en los dos temas, como en la pestaña; el contorno suave lo despega de
// los fondos claros. Es decorativo (aria-hidden).
export default function Ghost({ className = '' }) {
  return (
    <svg viewBox="4 2.5 24 29.5" className={className} aria-hidden="true" focusable="false">
      <path
        d="M5 14A11 11 0 0 1 27 14V22.5Q27 26.5 23 26.5H13.5L6.6 30.6Q5 31.4 5 29.6Z"
        fill="#ffffff"
        stroke="#143b3a"
        strokeOpacity=".12"
        strokeWidth=".6"
      />
      <ellipse cx="12" cy="15" rx="2.1" ry="2.9" fill="#143b3a" />
      <ellipse cx="20" cy="15" rx="2.1" ry="2.9" fill="#143b3a" />
      <path d="M14 20.3Q16 22.2 18 20.3" fill="none" stroke="#143b3a" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8.6" cy="19" r="1.4" fill="#f49ac1" opacity=".9" />
      <circle cx="23.4" cy="19" r="1.4" fill="#f49ac1" opacity=".9" />
    </svg>
  );
}
