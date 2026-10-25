// Datos con los que el servidor renderizó la página (hoy: la lista de salas). Para
// hidratar, el primer render del navegador tiene que usar los mismos, así que el
// servidor los deja en <script type="application/json" id="initial-data"> (es un
// bloque de datos, no código: la CSP no lo bloquea) y acá se leen.

let serverData = null;
let browserData;

// Solo lo llama entry-server.jsx, alrededor de un renderToString (que es
// sincrónico: no se mezclan pedidos).
export function setServerData(data) {
  serverData = data;
}

export function initialData(key) {
  if (serverData) return serverData[key];
  if (typeof document === 'undefined') return undefined;
  if (browserData === undefined) {
    try {
      browserData = JSON.parse(document.getElementById('initial-data')?.textContent || 'null') || {};
    } catch {
      browserData = {};
    }
  }
  return browserData[key];
}
