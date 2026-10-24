// Aplica el tema antes del primer pintado para que no haya flash blanco.
// Debe coincidir con la clave y la lógica de src/lib/theme.js.
// Vive en un archivo y no inline en index.html porque la CSP (server/index.js)
// solo deja correr scripts servidos por nosotros: un <script> inline es justo lo
// que bloquea, así que tendría que abrirle una excepción.
(function () {
  try {
    var saved = localStorage.getItem('chatnopolis-theme');
    var dark = saved ? saved === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    if (dark) document.documentElement.classList.add('dark');
  } catch (e) {}
})();
