// Prueba del dashboard: la página. No calcula ninguna cifra: enseña los textos que escribe
// preparar_datos.R (cada cifra ya con su formato y sus avisos), y dibuja el mapa y los gráficos.
// Pestañas por tema (temas.json); en cada una, una variable elegida colorea el mapa y tiene el primer gráfico.
// Cada lugar tiene su dirección: #/<nivel>/<código>?tema=<tema>&v=<columna> (#/municipio/41091?tema=alquiler).
// La entrada es España.
"use strict";

// Carpeta de los datos: toda España (datos/) o, con ?datos=prueba en la dirección, la prueba local de Sevilla
// (datos_prueba/, ver zona.R)
const DATOS = new URLSearchParams(location.search).get("datos") === "prueba" ? "datos_prueba/" : "datos/";
const NIVELES = ["nacional", "ccaa", "provincia", "municipio", "distrito", "seccion"];
const NOMBRE_NIVEL = { nacional: "España", ccaa: "las comunidades autónomas", provincia: "las provincias", municipio: "los municipios",
  distrito: "los distritos", seccion: "las secciones censales" };
// Colores y formas de cada mes, los del gráfico 3k
const MESES = {
  febrero:   { num: 2,  color: "#2a78d6", forma: "cuadrado" },
  mayo:      { num: 5,  color: "#1baf7a", forma: "triangulo" },
  agosto:    { num: 8,  color: "#e87ba4", forma: "circulo" },
  noviembre: { num: 11, color: "#8a8880", forma: "rombo" },
};
const ORDEN_CAPAS = ["provincias", "municipios", "zonas", "distritos", "secciones"];
const NOMBRE_CAPA = { distritos: "Distritos", secciones: "Secciones censales", municipios: "Municipios", provincias: "Provincias",
  zonas: "Zonas de Urban Audit" };
// Mapas que solo tienen las cifras de la pestaña Compra: no se abren si la cifra elegida no está en ninguno
const SOLO_COMPRA = /^(zonas_|municipios_venta$)/;
const SIN_DATO = "#d6d6d6";
// Color de cada tema, el de colores_proyecto (0_funciones.R): para la barra del lugar en las comparaciones
const COLOR_TEMA = [[/^construidas_protegidas/, "#1baf7a"], [/^turistic/, "#e87ba4"], [/^(alquil|anuncio)/, "#eb6834"], [/^(no_principales|menos_de|uno_a)/, "#eda100"],
  [/^vacia/, "#6250d6"], [/^(construid|anios_)/, "#3a3a38"], [/^(precio_venta|compras)/, "#2a78d6"]];
const AZUL_CLARO = "#9cc3ef";   // la otra medida del precio de venta, y la otra línea de las compras
const GRIS = "#c9c7c0";
const TINTA = "#22211f", TINTA_SUAVE = "#5c5a55", REJILLA = "#e4e2dc";

const $ = (id) => document.getElementById(id);
// Fecha de las cifras de construcción: «{periodo}» son los años de la media de cada lugar (preparar_datos.R); si hay
// varios (las barras de comparación), el del lugar y luego los de las áreas que lo contienen
function conPeriodo(texto, periodos) {
  if (!texto || texto.indexOf("{periodo}") < 0) return texto;
  const p = periodos.filter(Boolean).filter((x, i, a) => a.indexOf(x) === i);
  const t = !p.length ? "los años de la media" : p.length === 1 ? p[0] : p[0] + " en este lugar y " + p.slice(1).join(" y ") + " en las áreas que lo contienen";
  return texto.split("{periodo}").join(t);
}
// Cifras de elDiario.es: llevan su cita al lado
const DE_ELDIARIO = /^anuncios_|^vacias_por_anuncio$/;
function htmlCita(trozos) {
  trozos = trozos || (estado.temas && estado.temas.cita_eldiario) || [];
  return trozos.length ? '<p class="fuente">' + trozos.map((t) => t.url ? '<a href="' + esc(t.url) + '">' + esc(t.texto) + "</a>" : esc(t.texto)).join("") + "</p>" : "";
}
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const estrecha = () => window.matchMedia("(max-width: 899px)").matches;
const colorTema = (columna) => { for (const [re, c] of COLOR_TEMA) if (re.test(columna)) return c; return "#8a8880"; };
// Texto sobre un fondo de color: blanco o tinta, el que contraste más (luminancia relativa de WCAG)
const textoSobre = (color) => {
  const l = [1, 3, 5].map((i) => parseInt(color.substr(i, 2), 16) / 255)
    .map((c) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2] > 0.21 ? TINTA : "#fff";
};
// Botones con el color de su tema (decisión del usuario, 19 de octubre de 2026): la pestaña, el de su primera cifra
const estiloColor = (columna) => { const c = colorTema(columna); return ' style="--color:' + c + ";--texto:" + textoSobre(c) + '"'; };
// Ancho de los gráficos: el de la columna de la ficha, para que el texto se vea a su tamaño
const anchoGrafico = () => Math.round(Math.max(300, Math.min(720, (document.getElementById("ficha").clientWidth || 640) - 32)));
const numero = (x, d) => x.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });

// Cada archivo se pide una sola vez
const cache = new Map();
function cargar(ruta) {
  if (!cache.has(ruta)) {
    const p = fetch(DATOS + ruta).then((r) => {
      if (!r.ok) throw new Error(ruta + ": " + r.status);
      return r.json();
    });
    p.catch(() => cache.delete(ruta));
    cache.set(ruta, p);
  }
  return cache.get(ruta);
}

const estado = {
  mapa: null, fondo: null, capa: null, cajaCanarias: null, grupo: null, meta: null,
  temas: null, tema: "resumen", columna: null,
  ficha: null, col: null, porCodigo: new Map(), cifras: new Map(),
  capaElegida: {}, desdeMapa: false, infoVacias: false, infoTuristicas: false,
  sinColor: false, botonColor: null,   // colores del mapa quitados, para ver las calles
  metas: new Map(),   // cabecera de cada mapa ya cargado: qué áreas tienen mapa propio por debajo
};

// --- Temas y variable elegida ------------------------------------------------------------------------------------

const temaActual = () => estado.temas.temas.find((t) => t.id === estado.tema) || estado.temas.temas[0];
// Variables del tema que tiene el nivel de la ficha (las que están en su tabla)
const variablesDisponibles = () => temaActual().variables.filter((v) => estado.col && estado.col.columnas[v.columna]);
const variableActual = () => variablesDisponibles().find((v) => v.columna === estado.columna) || null;
// Las mismas, por cifra (`grupo`), con sus bases en orden
function gruposDisponibles() {
  const grupos = [];
  for (const v of variablesDisponibles()) {
    const g = grupos.find((x) => x.nombre === v.grupo);
    if (g) g.vars.push(v); else grupos.push({ nombre: v.grupo, vars: [v] });
  }
  return grupos;
}

function ajustarVariable() {
  const disp = variablesDisponibles();
  if (!disp.some((v) => v.columna === estado.columna)) estado.columna = disp.length ? disp[0].columna : null;
}

function direccion(nivel, codigo) {
  const q = new URLSearchParams();
  q.set("tema", estado.tema);
  if (estado.columna) q.set("v", estado.columna);
  return "#/" + nivel + "/" + codigo + "?" + q.toString();
}
function actualizarDireccion() {
  if (estado.ficha) history.replaceState(null, "", direccion(estado.ficha.nivel, estado.ficha.codigo));
}

function pintarPestanas() {
  const nav = $("pestanas");
  nav.innerHTML = estado.temas.temas.map((t) => '<button type="button" role="tab" data-tema="' + t.id + '" aria-selected="' +
    (t.id === estado.tema) + '"' + estiloColor(t.variables[0].columna) + ">" + esc(t.titulo) + "</button>").join("");
  nav.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    if (b.dataset.tema === estado.tema) return;
    estado.tema = b.dataset.tema;
    estado.columna = null;
    ajustarVariable();
    actualizarDireccion();
    pintarPestanas();
    pintarFicha();
    verMapaDeFicha(estado.ficha, false);
    b.scrollIntoView({ block: "nearest", inline: "nearest" });
  }));
}

// «Más información sobre las viviendas vacías»: solo en los niveles que tienen vacías (de España a municipio)
const ICONO_INFO = '<span class="icono-info" aria-hidden="true">i</span>';
const hayVacias = () => !!(estado.col && estado.col.columnas.vacias_pct_viviendas);
function htmlInfoVacias(abierta) {   // abierta o cerrada, se conserva al volver a pintar la ficha
  return '<details class="info-vacias" id="info-vacias"' + (abierta ? " open" : "") + "><summary>" + ICONO_INFO + "Más información sobre las viviendas vacías</summary>" +
    estado.temas.info_vacias + "</details>";
}
// «Más información sobre las viviendas turísticas»: en la pestaña Turísticas, con el mismo formato (21 de octubre de 2026)
function htmlInfoTuristicas(abierta) {
  return '<details class="info-vacias" id="info-turisticas"' + (abierta ? " open" : "") + "><summary>" + ICONO_INFO + "Más información sobre las viviendas turísticas</summary>" +
    estado.temas.info_turisticas + "</details>";
}
const htmlEnlaceVacias =() => '<p class="enlace-vacias"><button type="button" class="boton-enlace" data-ir-vacias>' + ICONO_INFO + 'Más información sobre las viviendas vacías</button></p>';
// Desde otra pestaña: abre la pestaña Vacías del mismo lugar, con el apartado abierto
function irAInfoVacias() {
  estado.tema = "vacias";
  estado.columna = null;
  ajustarVariable();
  actualizarDireccion();
  pintarPestanas();
  estado.infoVacias = true;
  pintarFicha();
  verMapaDeFicha(estado.ficha, false);
  $("info-vacias").scrollIntoView({ behavior: "smooth", block: "start" });
}

function elegirVariable(columna) {
  if (columna === estado.columna) return;
  estado.columna = columna;
  actualizarDireccion();
  pintarFicha();
  verMapaDeFicha(estado.ficha, false);
}

// --- Mapa ------------------------------------------------------------------------------------------------

function iniciarMapa() {
  estado.mapa = L.map("mapa", { preferCanvas: true, zoomSnap: 0.25 });
  estado.mapa.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  estado.fondo = L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', opacity: 0.6,
    maxZoom: 19,
  });
  estado.mapa.setView([40, -4], 5);
  // Leaflet solo mira el tamaño al cambiar la ventana; la leyenda y los botones también lo cambian
  if (window.ResizeObserver) new ResizeObserver(() => estado.mapa.invalidateSize({ pan: false })).observe($("mapa"));
  // Botón para quitar y poner los colores: quedan solo los bordes y se ven las calles del fondo
  const Boton = L.Control.extend({
    onAdd() {
      const b = L.DomUtil.create("button", "boton-colores leaflet-bar");
      b.type = "button";
      L.DomEvent.disableClickPropagation(b);
      L.DomEvent.on(b, "click", () => { estado.sinColor = !estado.sinColor; pintarColores(); });
      estado.botonColor = b;
      pintarBotonColor();
      return b;
    },
  });
  new Boton({ position: "topright" }).addTo(estado.mapa);
}

// Colores quitados, salvo en el mapa de provincias, que no tiene calles de fondo (Canarias va desplazada)
const quitarColores = () => estado.sinColor && !(estado.meta && estado.meta.canarias_desplazada);

function pintarColores() {
  const sin = quitarColores();
  pintarBotonColor();
  estado.fondo.setOpacity(sin ? 1 : 0.6);
  if (estado.capaFondo) estado.capaFondo.setStyle({ fillOpacity: sin ? 0 : 1 });
  if (estado.capa) estado.capa.setStyle(estilo);
  if (estado.capa) pintarCirculos();
}

function pintarBotonColor() {
  const b = estado.botonColor;
  if (!b) return;
  // Solo en los mapas con calles de fondo
  b.hidden = !!(estado.meta && estado.meta.canarias_desplazada);
  b.textContent = estado.sinColor ? "Poner colores" : "Quitar colores";
  b.setAttribute("aria-pressed", String(estado.sinColor));
  b.title = estado.sinColor ? "Volver a colorear las áreas" : "Dejar solo los bordes para ver las calles";
}

// El área de la ficha, o las áreas que contiene si es una comunidad, un municipio o un distrito (los mapas de
// distritos y de secciones son de toda la provincia, o de una parte de ella)
function esElegida(p) {
  const f = estado.ficha;
  if (!f) return false;
  // Mismo código solo si el mapa es del nivel de la ficha: comunidades y provincias comparten códigos (01 es
  // Andalucía y Álava)
  if (estado.meta && estado.meta.nivel === f.nivel && p.codigo === f.codigo) return true;
  // La zona de Urban Audit de una sección o de un distrito (pestaña Compra)
  if (f.compra && f.compra.zona && f.compra.zona.codigo === p.codigo) return true;
  if (f.nivel === "municipio") return p.mun === f.codigo;
  // Comunidad: sus provincias, o sus municipios con precio de venta (mapa de España); en el mapa de los municipios de
  // la comunidad, el padre es la provincia y no se resalta ninguno
  if (f.nivel === "ccaa") return !!estado.meta && (estado.meta.nivel === "provincia" || estado.meta.grupo === "municipios_venta") && p.padre === f.codigo;
  return f.nivel === "distrito" && p.padre === f.codigo;
}

// Columna que colorea el mapa: la elegida. En la pestaña Compra, los distritos y las secciones no tienen ninguna cifra,
// pero en las 17 ciudades con zonas de Urban Audit tienen el mapa de zonas: se colorea con la primera cifra del tema
// que esté en alguno de sus mapas (la subida del precio por m²)
function columnaMapa() {
  if (estado.columna) return estado.columna;
  const f = estado.ficha;
  if (!f || !f.mapa || temaActual().id !== "compra") return null;
  const enMapas = new Set();
  Object.values(f.mapa.variables).forEach((l) => l.forEach((i) => enMapas.add(estado.temas.variables_mapa[i])));
  const v = temaActual().variables.find((x) => x.mapa && enMapas.has(x.columna));
  return v ? v.columna : null;
}

// Posición (desde 1) de la variable del mapa en el mapa cargado; 0 si el mapa no la tiene
const indiceVariable = () => estado.meta ? estado.meta.variables.findIndex((v) => v.columna === columnaMapa()) + 1 : 0;

// Cifras que solo tienen las capitales (anuncios de elDiario.es): un círculo en cada capital, con el color de su clase
// y el área que crece con la población, y las áreas en gris debajo (pedido por el usuario el 25 de octubre de 2026)
const FONDO_GRIS = "#ecebe7";
const R_MIN = 5, R_MAX = 22;   // radio en píxeles de la capital menos y más poblada de las 52
const conCirculos = () => { const j = indiceVariable(); return !!(j && estado.meta.variables[j - 1].circulos && estado.meta.capitales); };
const radioCapital = (pob, escala) => Math.sqrt(R_MIN * R_MIN + (R_MAX * R_MAX - R_MIN * R_MIN) * (pob - escala[0]) / (escala[1] - escala[0]));

function estilo(feature) {
  const p = feature.properties;
  const j = indiceVariable();
  const v = j ? estado.meta.variables[j - 1] : null;
  const clase = v ? p["c" + j] : 0;
  const conAviso = v && p["a" + j];
  const elegida = esElegida(p);
  if (conCirculos()) return {
    fillColor: FONDO_GRIS, fillOpacity: quitarColores() ? 0 : 1,
    color: elegida ? "#000" : quitarColores() ? "#222" : "#fff", weight: elegida ? 3 : 0.6, dashArray: null,
  };
  return {
    fillColor: clase > 0 ? v.clases[clase - 1].color : SIN_DATO,
    // Sin colores, un relleno invisible: el área se sigue pudiendo pulsar
    fillOpacity: quitarColores() ? 0 : estado.meta.canarias_desplazada ? 0.95 : 0.8,
    color: elegida ? "#000" : conAviso || quitarColores() ? "#222" : "#fff",
    weight: elegida ? 3 : conAviso ? 1.5 : 0.6,
    dashArray: conAviso && !elegida ? "4 3" : null,
  };
}

function textoTooltip(p, capital) {
  const j = indiceVariable();
  const v = j ? estado.meta.variables[j - 1] : null;
  let h = "<strong>" + esc(p.titulo) + "</strong>";
  if (capital && estado.meta.nivel !== "municipio") h += "<br>Capital: " + esc(capital.nombre);
  if (v) h += "<br>" + esc(v.titulo) + ": " + esc(p["x" + j]);
  if (v && p["a" + j]) h += '<br><span class="marca-aviso">⚠ ' + esc(p["a" + j]) + "</span>";
  if (capital) h += "<br>Población de " + esc(capital.nombre) + ": " + esc(capital.texto_poblacion) + " habitantes";
  return h;
}

// Los círculos de las capitales, encima de las áreas; se rehacen al cambiar de cifra o de lugar
function pintarCirculos() {
  if (estado.capaCirculos) { estado.capaCirculos.remove(); estado.capaCirculos = null; }
  if (!conCirculos()) return;
  const j = indiceVariable();
  const v = estado.meta.variables[j - 1];
  const cap = estado.meta.capitales;
  // Los grandes primero, para que los pequeños queden encima
  const puntos = cap.puntos.slice().sort((a, b) => b.poblacion - a.poblacion);
  estado.capaCirculos = L.featureGroup(puntos.map((c) => {
    const area = estado.porCodigo.get(c.codigo);
    const p = area ? area.feature.properties : { codigo: c.codigo, titulo: c.nombre };
    const clase = p["c" + j] || 0;
    const elegida = esElegida(p), conAviso = !!p["a" + j];
    const m = L.circleMarker([c.lat, c.lon], {
      radius: radioCapital(c.poblacion, cap.escala),
      fillColor: clase > 0 ? v.clases[clase - 1].color : SIN_DATO, fillOpacity: 0.95,
      color: elegida ? "#000" : TINTA, weight: elegida ? 3 : conAviso ? 1.5 : 1, dashArray: conAviso && !elegida ? "3 2" : null,
    });
    m.bindTooltip(() => textoTooltip(p, c), { sticky: true });
    if (area) m.on("click", () => {
      estado.desdeMapa = true;
      location.hash = direccion(estado.meta.nivel, c.codigo);
    });
    return m;
  })).addTo(estado.mapa);
}
const circulosDelante = () => { if (estado.capaCirculos) estado.capaCirculos.bringToFront(); };

async function verGrupo(grupo, encuadrarSiempre) {
  const datos = await cargar("mapas/" + grupo + ".json");
  estado.metas.set(grupo, datos.meta);
  const nuevo = estado.grupo !== grupo;
  if (nuevo) {
    if (estado.capa) estado.capa.remove();
    if (estado.cajaCanarias) { estado.cajaCanarias.remove(); estado.cajaCanarias = null; }
    if (estado.capaFondo) { estado.capaFondo.remove(); estado.capaFondo = null; }
    estado.grupo = grupo;
    estado.meta = datos.meta;
    estado.porCodigo.clear();
    // Sin fondo en el mapa de provincias: Canarias va desplazada y no coincidiría con las calles
    if (datos.meta.canarias_desplazada) estado.fondo.remove();
    else estado.fondo.addTo(estado.mapa);
    // Provincias en gris debajo de las áreas, sin poder pulsarlas (mapa de los municipios con precio de venta)
    if (datos.meta.fondo) {
      estado.capaFondo = L.geoJSON(datos.meta.fondo, { interactive: false,
        style: { fillColor: "#ecebe7", fillOpacity: 1, color: "#fff", weight: 1 } }).addTo(estado.mapa);
    }
    estado.capa = L.geoJSON(datos, {
      style: estilo,
      onEachFeature: (f, capa) => {
        estado.porCodigo.set(f.properties.codigo, capa);
        capa.bindTooltip(() => textoTooltip(f.properties), { sticky: true });
        // Al pasar por un área, su bola en los gráficos de rangos de la ficha (prompt 11)
        capa.on("mouseover", () => marcarEnRangos(f.properties.codigo, true));
        capa.on("mouseout", () => marcarEnRangos(f.properties.codigo, false));
        // Las zonas de Urban Audit no tienen ficha: solo la etiqueta
        if (!datos.meta.sin_ficha) capa.on("click", () => {
          estado.desdeMapa = true;
          location.hash = direccion(datos.meta.nivel, f.properties.codigo);
        });
      },
    }).addTo(estado.mapa);
    // Canarias, desplazada, en un recuadro fino que no se puede pulsar
    if (datos.meta.caja_canarias) {
      estado.cajaCanarias = L.rectangle(datos.meta.caja_canarias, { interactive: false, fill: false, color: "#8a8880", weight: 1 }).addTo(estado.mapa);
    }
  }
  pintarColores();
  // La leyenda antes de encuadrar: cambia la altura del mapa, y con el mapa más bajo se cortaba Canarias
  pintarLeyenda();
  if (nuevo || encuadrarSiempre) encuadrar(nuevo);
  performance.mark("mapa");   // marcas para medir.R: cuánto se tarda en cada cambio de lugar
}

function encuadrar(nuevo) {
  // Con los gráficos del lugar en su sitio, el mapa no tiene tamaño: se encuadra al volver a él (graficos.js)
  if (!$("mapa").offsetParent) { estado.encuadrarPendiente = true; return; }
  estado.mapa.invalidateSize({ pan: false });   // el tamaño real del mapa, no el de cuando se creó
  const elegidas = [];
  estado.porCodigo.forEach((capa) => { if (esElegida(capa.feature.properties)) elegidas.push(capa); });
  elegidas.forEach((c) => c.bringToFront());
  circulosDelante();
  const opciones = { padding: [12, 12], maxZoom: 15 };
  const todo = estado.capa.getBounds();
  if (elegidas.length > 1) {
    estado.mapa.fitBounds(L.featureGroup(elegidas).getBounds(), opciones);
  } else if (elegidas.length === 1) {
    const b = elegidas[0].getBounds();
    // Una sección, o la única área que contiene el lugar (municipio de un distrito): de cerca; si no, todo el mapa
    const deCerca = estado.meta.nivel === "seccion" || (estado.ficha && estado.meta.nivel !== estado.ficha.nivel);
    if (nuevo) estado.mapa.fitBounds(deCerca ? b : todo, opciones);
    else if (!estado.mapa.getBounds().contains(b)) estado.mapa.fitBounds(b, opciones);
  } else {
    estado.mapa.fitBounds(todo, opciones);
  }
}

function pintarLeyenda() {
  const m = estado.meta;
  const j = indiceVariable();
  const f = estado.ficha;
  if (!j) {
    const v = variableActual();
    let motivo;
    if (!v) motivo = "Este tema no tiene cifras para " + NOMBRE_NIVEL[f.nivel] + ".";
    else if (!v.mapa) motivo = "«" + v.nombre + "» no colorea el mapa: solo la tienen unas pocas áreas.";
    else motivo = "«" + v.grupo + (v.nombre !== v.grupo ? " (" + v.nombre + ")" : "") + "» no está en el mapa de " + esc(m.titulo.toLowerCase()) + ".";
    $("leyenda").innerHTML = "<h3>" + esc(m.titulo) + "</h3><p>" + esc(motivo) + "</p>";
    return;
  }
  const v = m.variables[j - 1];
  const circulos = conCirculos();
  let hayAviso = false;
  estado.porCodigo.forEach((capa) => { if (capa.feature.properties["a" + j]) hayAviso = true; });
  let h = "<h3>" + esc(m.titulo) + ": " + esc(v.titulo) + "</h3><ul>";
  const forma = circulos ? "muestra redonda" : "muestra";
  h += v.clases.map((c) => '<li><span class="' + forma + '" style="background:' + c.color + '"></span>' +
    esc(c.rotulo) + " (" + c.n + ")</li>").join("");
  // Con círculos, las áreas sin capital no tienen dato, y ya lo dice el texto de debajo
  if (v.sin_dato && !circulos) h += '<li><span class="muestra" style="background:' + SIN_DATO + '"></span>' + esc(v.sin_dato_texto || "sin dato") + " (" + v.sin_dato + ")</li>";
  if (hayAviso) h += '<li><span class="' + forma + ' discontinua"></span>borde discontinuo: la cifra tiene aviso</li>';
  h += "</ul>";
  if (circulos) h += htmlTamanoCapitales(m.capitales, m.nivel);
  h += "<p>" + esc(v.clases_comunes || "Entre paréntesis, cuántas áreas hay en cada clase.") + "</p>";
  if (v.paleta === "variacion") h += "<p>Las subidas, de blanco (sin subida) a rojo oscuro: cuanto más sube, más cálido. Las bajadas, aparte, en azul claro.</p>";
  if (v.paleta === "calida") h += "<p>Cuanto más caro, más cálido.</p>";
  if (v.nota) h += "<p>" + esc(v.nota) + "</p>";
  h += "<p>Datos: " + esc([v.fuente, v.fecha].filter(Boolean).join(", ")) + ".</p>";
  if (DE_ELDIARIO.test(v.columna)) h += htmlCita();
  if (f && m.sin_contorno.indexOf(f.codigo) >= 0) {
    h += '<p class="marca-aviso">' + esc(f.titulo) + " no está en el mapa: no tiene contorno en el Censo 2021.</p>";
  }
  $("leyenda").innerHTML = h;
}

// Leyenda del tamaño de los círculos de las capitales: la menos poblada de las 52, la mediana y la más poblada
function htmlTamanoCapitales(cap, nivel) {
  const pobs = cap.ejemplos;
  const rs = pobs.map((p) => radioCapital(p, cap.escala));
  const H = 2 * R_MAX + 22;
  let x = 2, s = "";
  pobs.forEach((p, i) => {
    // Cada círculo con su número debajo, centrados: el hueco es el más ancho de los dos
    const et = numero(Math.round(p), 0), mitad = Math.max(rs[i], anchoTexto(et) / 2);
    const cx = x + mitad;
    s += '<circle cx="' + cx + '" cy="' + (2 * R_MAX + 2 - rs[i]) + '" r="' + rs[i] + '" fill="none" stroke="' + TINTA_SUAVE + '"/>' +
      '<text x="' + cx + '" y="' + (H - 4) + '" text-anchor="middle" font-size="11" fill="' + TINTA_SUAVE + '">' + esc(et) + "</text>";
    x = cx + mitad + 18;
  });
  const W = Math.ceil(x);
  const areas = nivel === "municipio" ? "Los municipios, en gris" : "Las provincias, en gris";
  return '<p>Cada círculo es una capital de provincia, con el color de su cifra. ' + areas + ": elDiario.es solo cuenta los anuncios de las capitales.</p>" +
    '<p>El tamaño del círculo crece con la población de la capital (habitantes: la capital menos poblada, la mediana de las capitales y la más poblada):</p>' +
    '<svg class="tamano-capitales" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Tamaño del círculo según la población">' + s + "</svg>" +
    "<p>Población: " + esc(cap.fuente_poblacion) + ".</p>";
}

// Botones para cambiar de mapa (las áreas que contiene la ficha, o las de su nivel), si hay más de uno
function pintarCapas(grupos, elegida) {
  const div = $("capas");
  if (grupos.length < 2) { div.hidden = true; return; }
  div.hidden = false;
  // Las secciones de una provincia grande van en partes (secciones_28_1, secciones_28_2…)
  const nombre = (g) => { const p = g.match(/^secciones_\d+_(\d+)$/); return (estado.temas.nombres_capas || {})[g] || (NOMBRE_CAPA[g.split("_")[0]] || g) + (p ? " (parte " + p[1] + ")" : ""); };
  // De arriba abajo: Municipios, Distritos, Secciones censales (pedido por el usuario el 19 de octubre de 2026)
  const orden = (g) => ORDEN_CAPAS.indexOf(g.split("_")[0]);
  grupos = grupos.slice().sort((a, b) => orden(a) - orden(b) || (a < b ? -1 : a > b ? 1 : 0));
  div.innerHTML = grupos.map((g) => '<button type="button" data-grupo="' + g + '" aria-pressed="' + (g === elegida) + '">' +
    esc(nombre(g)) + "</button>").join("");
  div.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => {
    estado.capaElegida[estado.ficha.codigo] = b.dataset.grupo;
    pintarCapas(grupos, b.dataset.grupo);
    performance.clearMarks(); performance.mark("ruta");
    verGrupo(b.dataset.grupo, true);
  }));
}

// Mapa de la ficha: primero las áreas que contiene; si no tienen la variable elegida, las de su nivel
function verMapaDeFicha(f, fichaNueva) {
  const candidatos = f.mapa.hijos.slice();
  if (f.mapa.grupo && candidatos.indexOf(f.mapa.grupo) < 0) candidatos.push(f.mapa.grupo);
  if (!candidatos.length) candidatos.push("provincias");
  // Qué variables colorea cada mapa: lo dice la ficha, con números de la lista variables_mapa de temas.json
  const columna = columnaMapa();
  const tiene = (g) => (f.mapa.variables[g] || []).some((i) => estado.temas.variables_mapa[i] === columna);
  const con = candidatos.filter(tiene);
  const elegida = estado.capaElegida[f.codigo];
  const normales = candidatos.filter((g) => !SOLO_COMPRA.test(g));
  const grupo = elegida && con.indexOf(elegida) >= 0 ? elegida : con[0] || (elegida && candidatos.indexOf(elegida) >= 0 ? elegida : normales[0] || candidatos[0]);
  pintarCapas(con.length ? con : candidatos, grupo);
  return verGrupo(grupo, fichaNueva).then(() => {
    // Los otros mapas, pedidos ya, para que los botones no esperen a la red
    candidatos.filter((g) => g !== grupo).forEach((g) => cargar("mapas/" + g + ".json").catch(() => {}));
  }).catch(() => {
    $("leyenda").innerHTML = '<p class="error">No se ha podido cargar el mapa.</p>';
  });
}

// --- Cifras de la ficha ------------------------------------------------------------------------------------------

function marcas(f, avisos) {
  if (!avisos.length) return "";
  return '<span class="marca-aviso" title="' + esc(avisos.map((i) => f.avisos[i]).join("; ")) + '">⚠ ' +
    avisos.map((i) => i + 1).join(", ") + "</span>";
}

// Una destacada con `antes` se lee «<antes> <cifra> <etiqueta>», en una sola frase, y va bajo la anterior, en su misma casilla
function htmlDestacada(f, d) {
  let h = '<div class="destacada' + (d.antes ? " junto" : "") + '" data-columna="' + d.columna + '">' +
    (d.antes ? '<div class="frase">' + esc(d.antes) + ' <span class="numero">' + esc(d.texto) + "</span> " + esc(d.etiqueta) + "</div>"
      : '<div class="numero">' + esc(d.texto) + '</div><div class="etiqueta">' + esc(d.etiqueta) + "</div>") +
    (d.fecha ? '<div class="fecha">' + esc(d.fecha) + "</div>" : "");
  if (d.avisos.length) h += '<div class="aviso"><ul>' + d.avisos.map((i) => "<li>⚠ " + esc(f.avisos[i]) + "</li>").join("") + "</ul></div>";
  return h + "</div>";
}
function htmlDestacadas(f) {
  const casillas = [];
  for (const d of f.destacadas) {
    if (d.antes && casillas.length) casillas[casillas.length - 1].push(d); else casillas.push([d]);
  }
  return '<div class="destacadas">' + casillas.map((c) => '<div class="casilla">' + c.map((d) => htmlDestacada(f, d)).join("") + "</div>").join("") + "</div>";
}
// Las casillas, en columnas: cada una, en orden, a la columna más corta. En una cuadrícula cada fila es tan alta como su
// casilla más alta, y una casilla con varias cifras o con aviso dejaba un hueco al lado. Se reparten otra vez si cambia
// el número de columnas (170 px como mínimo cada una, como antes la cuadrícula).
function colocarCasillas(zona) {
  if (estado.obsCasillas) estado.obsCasillas.disconnect();
  const caja = zona.querySelector(".destacadas");
  if (!caja) return;
  const casillas = Array.from(caja.querySelectorAll(".casilla"));
  let n = 0;
  const repartir = () => {
    const nuevo = Math.max(1, Math.floor((caja.clientWidth + 8) / (170 + 8)));
    if (nuevo === n) return;
    n = nuevo;
    caja.classList.add("en-columnas");
    caja.textContent = "";
    const columnas = [];
    for (let i = 0; i < n; i++) {
      const c = caja.appendChild(document.createElement("div"));
      c.className = "columna";
      columnas.push(c);
    }
    for (const c of casillas) columnas.reduce((a, b) => (b.offsetHeight < a.offsetHeight ? b : a)).appendChild(c);
  };
  repartir();
  if (window.ResizeObserver) (estado.obsCasillas = new ResizeObserver(repartir)).observe(caja);
}

// Tarjeta de una variable del tema: la cifra del lugar, qué es, la fecha y sus avisos. La elegida, grande.
function htmlTarjeta(f, v, elegida) {
  const x = estado.cifras.get(v.columna);
  const c = estado.col.columnas[v.columna] || {};
  const avisos = x ? x.avisos : [];
  let h = (elegida ? '<div class="tarjeta elegida"' : '<button type="button" class="tarjeta" data-elegir="' + v.columna + '"') +
    ' data-columna="' + v.columna + '"><span class="numero">' + esc(x ? x.texto : "sin dato") + "</span>" +
    // Un rango (la cifra de las áreas que contiene el lugar): de qué área a qué área
    (x && x.rango ? '<span class="detalle">' + esc(x.rango.detalle) + "</span>" : "") +
    '<span class="etiqueta">' + esc(c.titulo || v.nombre) + "</span>" + (c.fecha ? '<span class="fecha">' + esc(conPeriodo(c.fecha, [f.periodo_construccion])) + "</span>" : "");
  if (elegida && avisos.length) h += '<span class="aviso"><ul>' + avisos.map((i) => "<li>⚠ " + esc(f.avisos[i]) + "</li>").join("") + "</ul></span>";
  else if (avisos.length) h += marcas(f, avisos);
  if (elegida && x && x.rango) h += '<span class="nota-rango">' + esc(x.rango.nota) + "</span>";
  else if (elegida && c.que_es) h += '<span class="que-es-tarjeta">' + esc(c.que_es) + "</span>";
  return h + (elegida ? "</div>" : "</button>");
}

// Un bloque de cifras, plegable; nunca dentro de otro desplegable (decisión del usuario, 17 de octubre de 2026)
function htmlBloque(f, b, col) {
  const info = col.bloques[b.id] || {};   // título, fuente y fecha del bloque: iguales en todo el nivel
  let h = '<details class="bloque" data-bloque="' + b.id + '"><summary>' + esc(info.titulo) +
    (b.avisos.length ? ' <span class="marca-aviso">⚠ con avisos</span>' : "") + "</summary>";
  if (b.avisos.length) {
    h += '<div class="aviso"><ul>' + b.avisos.map((i) => "<li><strong>⚠ " + (i + 1) + "</strong> " + esc(f.avisos[i]) + "</li>").join("") + "</ul></div>";
  }
  h += '<dl class="cifras">' + b.cifras.map((x) => {
    const c = col.columnas[x.columna] || {};
    return '<div class="cifra" data-columna="' + x.columna + '"><dt>' + esc(c.titulo || x.columna) +
      (c.que_es ? ' <button type="button" class="boton-que-es" aria-expanded="false" aria-label="Qué es">?</button>' : "") +
      "</dt><dd>" + esc(x.texto) + (x.rango ? ' <span class="detalle">' + esc(x.rango.detalle) + "</span>" : "") + " " + marcas(f, x.avisos) + "</dd>" +
      (c.que_es ? '<dd class="que-es" hidden>' + esc(c.que_es) + (c.calculo && /esta página/.test(c.calculo) ? " " + esc(c.calculo) : "") +
        (c.limites ? " " + esc(c.limites) : "") + "</dd>" : "") + "</div>";
  }).join("") + "</dl>";
  h += '<p class="fuente">Fuente: ' + esc(info.fuente) + ". Fecha: " + esc(conPeriodo(info.fecha, [f.periodo_construccion])) + ".</p>";
  if (b.id === "anuncios") h += htmlCita();
  if (info.nota) h += '<p class="fuente">' + esc(info.nota) + "</p>";
  return h + "</details>";
}

// --- Gráficos ----------------------------------------------------------------------------------------------------

// Separación de las líneas del eje: 1, 2 o 5 por una potencia de 10, con unas cuatro líneas
function pasoEje(max) {
  if (!(max > 0)) return 1;
  const bruto = max / 4, base = Math.pow(10, Math.floor(Math.log10(bruto)));
  const r = bruto / base;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 5 ? 5 : 10) * base;
}

function marcaPunto(forma, x, y, color, titulo) {
  const t = titulo ? "<title>" + esc(titulo) + "</title>" : "";
  if (forma === "cuadrado") return '<rect x="' + (x - 4.5) + '" y="' + (y - 4.5) + '" width="9" height="9" fill="' + color + '">' + t + "</rect>";
  if (forma === "triangulo") return '<polygon points="' + x + "," + (y - 6) + " " + (x + 5.5) + "," + (y + 4) + " " + (x - 5.5) + "," + (y + 4) + '" fill="' + color + '">' + t + "</polygon>";
  if (forma === "rombo") return '<polygon points="' + x + "," + (y - 6) + " " + (x + 6) + "," + y + " " + x + "," + (y + 6) + " " + (x - 6) + "," + y + '" fill="' + color + '">' + t + "</polygon>";
  return '<circle cx="' + x + '" cy="' + y + '" r="5" fill="' + color + '">' + t + "</circle>";
}

// Marco común de los gráficos de líneas y columnas: eje y desde 0 con unas cuatro líneas, años en el eje x
function marco(W, H, m, ymax, fmtY, x0, x1, sx, pasoX) {
  const paso = pasoEje(ymax);
  const top = Math.max(paso, Math.ceil(ymax / paso) * paso);
  const sy = (y) => H - m.abj - (y / top) * (H - m.arr - m.abj);
  let g = "";
  for (let y = 0; y <= top + 1e-9; y += paso) {
    g += '<line x1="' + m.izq + '" x2="' + (W - m.der) + '" y1="' + sy(y) + '" y2="' + sy(y) + '" stroke="' + REJILLA + '"/>' +
      '<text x="' + (m.izq - 6) + '" y="' + (sy(y) + 4) + '" text-anchor="end" font-size="12" fill="' + TINTA_SUAVE + '">' + fmtY(y) + "</text>";
  }
  for (let a = x0; a <= x1; a += pasoX) {
    g += '<text x="' + sx(a) + '" y="' + (H - 10) + '" text-anchor="middle" font-size="12" fill="' + TINTA_SUAVE + '">' + a + "</text>";
  }
  return { g, sy };
}

// `pie`: HTML que va al final (la cita de elDiario.es)
function htmlGrafico(titulo, svg, tabla, notas, fuente, extra, pie) {
  return '<section class="grafico"><h2>' + esc(titulo) + "</h2>" + (extra || "") + svg +
    (tabla ? "<details><summary>Ver los datos del gráfico</summary>" + tabla + "</details>" : "") +
    '<ul class="notas">' + notas.map((n) => "<li>" + esc(n) + "</li>").join("") + (fuente ? "<li>Fuente: " + esc(fuente) + ".</li>" : "") + "</ul>" + (pie || "") + "</section>";
}

const tablaHtml = (cabecera, filas) => "<table><thead><tr>" + cabecera.map((c) => "<th>" + esc(c) + "</th>").join("") +
  "</tr></thead><tbody>" + filas.map((f) => "<tr>" + f.map((c) => "<td>" + c + "</td>").join("") + "</tr>").join("") + "</tbody></table>";

// Turísticas en el tiempo: una línea por mes de medición, como en 3k; medida = pct, por100 (alquiladas),
// por100p (habitadas) o num
function htmlSerieTuristicas(s, medida) {
  let nota = null;
  if (medida === "pct" && !s.con_pct) { medida = "num"; nota = "Sin total de viviendas del Censo 2021 para esta área: se dibuja el número de viviendas."; }
  if (medida === "por100" && !s.con_por100) { medida = "num"; nota = "Sin viviendas alquiladas del Censo 2021 para esta área: se dibuja el número de viviendas."; }
  if (medida === "por100p" && !s.con_por100p) { medida = "num"; nota = "Sin viviendas principales del Censo 2021 para esta área: se dibuja el número de viviendas."; }
  const W = anchoGrafico(), H = estrecha() ? 240 : 280, m = { izq: 50, der: 18, arr: 26, abj: 30 };
  const valor = (p) => medida === "pct" ? p.pct : medida === "por100" ? p.por100 : medida === "por100p" ? p.por100p : p.valor;
  const texto = (p) => medida === "pct" ? p.texto_pct : medida === "por100" ? p.texto_por100 : medida === "por100p" ? p.texto_por100p : p.texto;
  const avisoDe = (p) => [p.aviso, medida === "por100" ? p.aviso_por100 : null].filter(Boolean).join("; ");
  const pts = s.puntos.map((p) => ({ p, x: p.anio + (MESES[p.mes].num - 1) / 12, y: valor(p), et: texto(p) }));
  const xs = pts.map((d) => d.x);
  const x0 = Math.floor(Math.min(...xs)), x1 = Math.ceil(Math.max(...xs) + 0.01);
  const sx = (x) => m.izq + ((x - x0) / (x1 - x0)) * (W - m.izq - m.der);
  const fmt = (y) => y.toLocaleString("es-ES", { maximumFractionDigits: 2 }) + (medida === "pct" ? "%" : "");
  const { g: base, sy } = marco(W, H, m, Math.max(...pts.map((d) => d.y)), fmt, x0, x1, sx, 1);
  let g = base;
  const meses = Object.keys(MESES).filter((mm) => pts.some((d) => d.p.mes === mm));
  for (const mm of meses) {
    const d = pts.filter((q) => q.p.mes === mm);
    const c = MESES[mm].color;
    if (d.length > 1) g += '<polyline fill="none" stroke="' + c + '" stroke-width="2" points="' + d.map((q) => sx(q.x) + "," + sy(q.y)).join(" ") + '"/>';
    for (const q of d) g += marcaPunto(MESES[mm].forma, sx(q.x), sy(q.y), c, q.p.mes + " de " + q.p.anio + ": " + q.et + (avisoDe(q.p) ? " (⚠ " + avisoDe(q.p) + ")" : ""));
    const u = d[d.length - 1];
    g += '<text x="' + Math.min(sx(u.x), W - m.der - 2) + '" y="' + (sy(u.y) - 9) + '" text-anchor="end" font-size="12" font-weight="600" fill="' + TINTA + '">' + esc(u.et) + "</text>";
  }
  const leyenda = '<div class="leyenda-meses">' + meses.map((mm) => '<span><svg width="14" height="14" aria-hidden="true">' +
    marcaPunto(MESES[mm].forma, 7, 7, MESES[mm].color, "") + "</svg> " + mm + "</span>").join("") + "</div>";
  const titulo = medida === "pct" ? "Viviendas turísticas, en % de las viviendas" : medida === "por100" ? "Viviendas turísticas por cada cien alquiladas" :
    medida === "por100p" ? "Viviendas turísticas por cada cien habitadas" : "Viviendas turísticas";
  const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + g + "</svg>";
  const tabla = tablaHtml(["Medición", "Viviendas turísticas", "% de las viviendas", "Por cada cien habitadas", "Por cada cien alquiladas", "Aviso"],
    s.puntos.map((p) => [p.mes + " de " + p.anio, esc(p.texto), esc(p.texto_pct), esc(p.texto_por100p), esc(p.texto_por100),
      [p.aviso, p.aviso_por100].filter(Boolean).map((a) => "⚠ " + esc(a)).join("; ")]));
  return htmlGrafico(titulo, svg, tabla, (nota ? [nota] : []).concat(s.notas), s.fuente, leyenda);
}

// Alquiler de los pisos, 2011-2024: una línea; medida = m2 o mes
function htmlSerieAlquiler(s, medida) {
  const W = anchoGrafico(), H = estrecha() ? 230 : 260, m = { izq: 56, der: 22, arr: 26, abj: 30 };
  const pts = s.puntos.filter((p) => p[medida] != null).map((p) => ({ x: p.anio, y: p[medida], et: medida === "m2" ? p.texto_m2 : p.texto_mes }));
  const titulo = medida === "m2" ? "Alquiler mediano de los pisos, por m² al mes (contratos en vigor)" : "Alquiler mediano de los pisos, al mes (contratos en vigor)";
  if (!pts.length) return htmlGrafico(titulo, '<p class="sin-grafico">Sin datos del Ministerio para esta área.</p>', null, [], s.fuente);
  const x0 = 2011, x1 = 2024;
  const sx = (x) => m.izq + ((x - x0) / (x1 - x0)) * (W - m.izq - m.der);
  const fmt = (y) => numero(y, y % 1 ? 1 : 0) + " €";
  const { g: base, sy } = marco(W, H, m, Math.max(...pts.map((d) => d.y)), fmt, x0, x1, sx, W < 420 ? 3 : W < 600 ? 2 : 1);
  let g = base;
  // La línea se corta en los años sin dato
  let tramo = [];
  const tramos = [];
  for (let a = x0; a <= x1; a++) {
    const p = pts.find((d) => d.x === a);
    if (p) tramo.push(p); else if (tramo.length) { tramos.push(tramo); tramo = []; }
  }
  if (tramo.length) tramos.push(tramo);
  const color = colorTema("alquiler");
  for (const t of tramos) if (t.length > 1) g += '<polyline fill="none" stroke="' + color + '" stroke-width="2" points="' + t.map((q) => sx(q.x) + "," + sy(q.y)).join(" ") + '"/>';
  for (const q of pts) g += '<circle cx="' + sx(q.x) + '" cy="' + sy(q.y) + '" r="4" fill="' + color + '" stroke="#fff" stroke-width="1.5"><title>' + q.x + ": " + esc(q.et) + "</title></circle>";
  // Rótulos: 2015 (el año base de las variaciones) y el último
  const rotular = [pts.find((d) => d.x === 2015), pts[pts.length - 1]].filter((d, i, a) => d && a.indexOf(d) === i);
  for (const q of rotular) g += '<text x="' + Math.min(Math.max(sx(q.x), m.izq + 20), W - m.der) + '" y="' + (sy(q.y) - 10) + '" text-anchor="' +
    (q.x === x1 ? "end" : "middle") + '" font-size="12" font-weight="600" fill="' + TINTA + '">' + esc(q.et) + "</text>";
  const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + g + "</svg>";
  const tabla = tablaHtml(["Año", "Al mes", "Por m²", "Pisos en la muestra"],
    s.puntos.map((p) => [p.anio, esc(p.texto_mes), esc(p.texto_m2), p.pisos.toLocaleString("es-ES")]));
  return htmlGrafico(titulo, svg, tabla, s.notas, s.fuente);
}

// Barras horizontales, cada una con su rótulo encima y su cifra al final; para comparaciones y subidas
function svgBarras(filas, titulo) {
  const W = anchoGrafico(), izq = 8, der = 70, alto = 40;
  const H = filas.length * alto + 8;
  const vals = filas.map((f) => f.valor);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  const sx = (x) => izq + ((x - lo) / ((hi - lo) || 1)) * (W - izq - der);
  let g = "";
  filas.forEach((f, i) => {
    const y = i * alto + 4;
    const a = sx(Math.min(0, f.valor)), b = sx(Math.max(0, f.valor));
    g += '<text x="' + izq + '" y="' + (y + 13) + '" font-size="13" fill="' + TINTA + '"' + (f.destacada ? ' font-weight="700"' : "") + ">" + esc(f.etiqueta) + "</text>";
    g += '<rect x="' + a + '" y="' + (y + 19) + '" width="' + Math.max(b - a, 1) + '" height="14" rx="3" fill="' + f.color + '"><title>' + esc(f.etiqueta + ": " + f.texto) + "</title></rect>";
    const neg = f.valor < 0;
    g += '<text x="' + (neg ? a - 6 : b + 6) + '" y="' + (y + 30) + '" text-anchor="' + (neg ? "end" : "start") + '" font-size="13" font-weight="600" fill="' + TINTA + '">' + esc(f.texto) + "</text>";
  });
  if (lo < 0) g += '<line x1="' + sx(0) + '" x2="' + sx(0) + '" y1="0" y2="' + H + '" stroke="' + TINTA_SUAVE + '"/>';
  return '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + g + "</svg>";
}

// El lugar frente a las áreas que lo contienen y España. `mas`: notas y HTML del final propios de la cifra (las
// compras por no residentes)
function htmlComparar(f, columna, mas) {
  mas = mas || {};
  const c = estado.col.columnas[columna] || {};
  const titulo = c.titulo || columna;
  const ctx = f.contexto && f.contexto.cifras[columna];
  if (!ctx) return "";
  const corto = (t) => t.replace(/^Comunidad autónoma: /, "");
  const filas = [];
  ctx.forEach((x, k) => {
    if (x.valor == null) return;
    const area = f.contexto.areas[k];
    filas.push({ etiqueta: (k === 0 ? "" : "") + corto(area.titulo), valor: x.valor, texto: x.texto, destacada: k === 0,
      color: k === 0 ? colorTema(columna) : GRIS, enlace: area.enlace });
  });
  const notas = ["Barras: este lugar (en color) y las áreas que lo contienen, hasta España (en gris). Cada área, con la cifra de su tabla; sus avisos, en su ficha."].concat(mas.notas || []);
  const fecha = conPeriodo(c.fecha, f.contexto.areas.map((a) => a.periodo));
  const cita = (DE_ELDIARIO.test(columna) ? htmlCita() : "") + (mas.pie || "");
  if (ctx[0].valor == null) return htmlGrafico(titulo, '<p class="sin-grafico">Este lugar no tiene esta cifra: los avisos de la ficha dicen por qué.</p>', null, [], c.fuente, "", cita);
  if (filas.length === 1) notas.push("Las áreas que contienen este lugar no tienen esta cifra.");
  const tabla = tablaHtml(["Área", "Cifra"], ctx.map((x, k) => {
    const a = f.contexto.areas[k];
    return [k === 0 ? esc(a.titulo) : '<a href="' + direccion(a.nivel, a.enlace.split("/").pop()) + '">' + esc(a.titulo) + "</a>", esc(x.texto)];
  }));
  return htmlGrafico(titulo, svgBarras(filas, titulo), tabla, notas, [c.fuente, fecha].filter(Boolean).join(", "), "", cita);
}

// Subidas del alquiler, del salario mediano y de los precios, de 2015 a 2024 (euros de cada año)
function htmlVariacion(f, columna) {
  const s = f.salarios;
  const m2 = estado.cifras.get("alquiler_m2_variacion_pct_2015_2024"), mes = estado.cifras.get("alquiler_mes_variacion_pct_2015_2024");
  const filas = [];
  const alquileres = [{ x: m2, etiqueta: "Alquiler por m² (pisos)", columna: "alquiler_m2_variacion_pct_2015_2024" },
    { x: mes, etiqueta: "Alquiler al mes (pisos)", columna: "alquiler_mes_variacion_pct_2015_2024" }];
  alquileres.sort((a, b) => (b.columna === columna) - (a.columna === columna));
  for (const a of alquileres) if (a.x && a.x.valor != null) filas.push({ etiqueta: a.etiqueta, valor: a.x.valor, texto: a.x.texto,
    color: a.columna === columna ? colorTema("alquiler") : "#f5b08f", destacada: a.columna === columna });
  if (!s) return "";
  const conAlquiler = filas.length > 0;
  filas.push({ etiqueta: "Salario mediano (" + s.ambito + ")", valor: s.salario.variacion, texto: s.salario.texto, color: "#3a3a38" });
  filas.push({ etiqueta: "Precios (IPC de " + s.ipc.ambito + ")", valor: s.ipc.variacion, texto: s.ipc.texto, color: "#8a8880" });
  const titulo = "Subida de " + s.anio_inicio + " a " + s.anio_fin + ": alquiler, salario y precios";
  const cifra = (c) => { const x = estado.cifras.get(c); return x ? esc(x.texto) : "sin dato"; };
  const tabla = tablaHtml(["", String(s.anio_inicio), String(s.anio_fin), "Subida"], [
    ["Alquiler mediano al mes (pisos)", cifra("alquiler_mes_mediana_2015"), cifra("alquiler_mes_mediana_2024"), mes ? esc(mes.texto) : "sin dato"],
    ["Alquiler mediano por m² (pisos)", cifra("alquiler_m2_mediana_2015"), cifra("alquiler_m2_mediana_2024"), m2 ? esc(m2.texto) : "sin dato"],
    ["Salario mediano bruto al año (" + esc(s.ambito) + ")", esc(s.salario.texto_inicio), esc(s.salario.texto_fin), esc(s.salario.texto)],
    ["Índice de precios de consumo (media anual; 2025 = 100; " + esc(s.ipc.ambito) + ")", numero(s.ipc.inicio, 1), numero(s.ipc.fin, 1), esc(s.ipc.texto)]]);
  const notas = [];
  if (!conAlquiler) notas.push("Este lugar no tiene la subida del alquiler (ver los avisos): solo se ven el salario y los precios.");
  notas.push(...notasSalarioIpc(s),
    "El alquiler es la mediana de los alquileres de pisos en vigor declarados a Hacienda (Ministerio de Vivienda): lo que pagan quienes ya tienen contrato, no el precio de los contratos nuevos. No es un índice de precios y la base crece de un año a otro.");
  if (s.nota) notas.push(s.nota);
  return htmlGrafico(titulo, svgBarras(filas, titulo), tabla, notas, null);
}

// Notas del salario y del IPC, en las subidas del alquiler y del precio de venta
function notasSalarioIpc(s) {
  return ["Euros de cada año, sin descontar la inflación: por eso va al lado la subida de los precios.",
    "Salario: mediana de la ganancia bruta anual por trabajador de " + s.ambito + " (la mitad de los trabajadores gana menos y la otra mitad, más). " + s.salario.fuente + ".",
    "Precios: " + s.ipc.fuente + ". El índice solo sirve para ver cuánto suben los precios en un mismo sitio: no dice si un sitio es más caro que otro." +
      (s.ipc.nivel === "provincia" ? " El INE recoge los precios de la provincia en su capital y en otros municipios que, juntos, tienen al menos el 30% de su población." : "")];
}

// --- Pestaña Compra (decisiones del usuario, 22 y 23 de octubre de 2026; diseño en compra_diseno.md) -----------------

const NOTA_VENTA = "Precio de venta: media de lo que se pagó por las viviendas libres (pisos y unifamiliares) vendidas cada año ante notario, también por empresas; la calcula el INE con datos del Consejo General del Notariado. No es un índice de precios: si cambia lo que se vende (zona, tamaño, nueva o usada), cambia la media.";
// Años de la subida del precio de venta: los de las columnas de las tablas por nivel (precio_venta_m2_2015 y _2024)
const ANIOS_VENTA = [2015, 2024];
// «2010–2025»: el primer y el último año de los puntos de una serie
const anios = (puntos) => puntos[0].anio + "–" + puntos[puntos.length - 1].anio;
const plegado = (resumen, html) => '<details class="plegado"><summary>' + esc(resumen) + "</summary>" + html + "</details>";

// Líneas en el tiempo: cada línea, { nombre, color, pts: [{ x, y, et }] }, cortada donde falta un periodo (`paso`: 1 en
// los años, 0,5 en los semestres); se rotulan los puntos de la primera línea en las x de `rotular`
function svgLineas(lineas, x0, x1, paso, fmtY, titulo, rotular) {
  const W = anchoGrafico(), H = estrecha() ? 230 : 260, m = { izq: 66, der: 22, arr: 26, abj: 30 };
  const sx = (x) => m.izq + ((x - x0) / (x1 - x0)) * (W - m.izq - m.der);
  const ymax = Math.max(...lineas.flatMap((l) => l.pts.map((p) => p.y)));
  const pasoX = Math.ceil((x1 - x0) / (W < 420 ? 4 : W < 600 ? 6 : 8));
  const { g: base, sy } = marco(W, H, m, ymax, fmtY, x0, Math.floor(x1), sx, pasoX);
  let g = base;
  for (const l of lineas) {
    const pts = l.pts.slice().sort((a, b) => a.x - b.x);
    let tramo = [];
    const tramos = [];
    pts.forEach((p, i) => {
      if (i && p.x - pts[i - 1].x > paso + 1e-9) { tramos.push(tramo); tramo = []; }
      tramo.push(p);
    });
    if (tramo.length) tramos.push(tramo);
    for (const t of tramos) if (t.length > 1) g += '<polyline fill="none" stroke="' + l.color + '" stroke-width="2" points="' + t.map((q) => sx(q.x) + "," + sy(q.y)).join(" ") + '"/>';
    for (const q of pts) g += '<circle cx="' + sx(q.x) + '" cy="' + sy(q.y) + '" r="3.5" fill="' + l.color + '" stroke="#fff" stroke-width="1"><title>' + esc(l.nombre + ", " + q.nombre + ": " + q.et) + "</title></circle>";
  }
  const primera = lineas[0].pts.filter((q) => rotular.indexOf(q.x) >= 0);
  // Un rótulo seguido de otro muy cerca (2024 y 2025) va debajo de su punto, para que no se pisen
  const debajo = (q) => primera.some((o) => o.x > q.x && o.x - q.x <= 1.5);
  for (const q of primera) g += '<text x="' + Math.min(Math.max(sx(q.x), m.izq + 24), W - m.der) + '" y="' + (sy(q.y) + (debajo(q) ? 20 : -10)) + '" text-anchor="' +
    (sx(q.x) > W - m.der - 30 ? "end" : "middle") + '" font-size="12" font-weight="600" fill="' + TINTA + '" stroke="#fff" stroke-width="3" paint-order="stroke">' + esc(q.et) + "</text>";
  const leyenda = lineas.length > 1 ? '<div class="leyenda-meses">' + lineas.map((l) => '<span><svg width="14" height="14" aria-hidden="true"><line x1="0" x2="14" y1="7" y2="7" stroke="' +
    l.color + '" stroke-width="3"/></svg> ' + esc(l.nombre) + "</span>").join("") + "</div>" : "";
  return leyenda + '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + g + "</svg>";
}

// Precio de venta, cada año de la serie: una línea; medida = m2 o medio
function htmlSerieVenta(s, medida) {
  const titulo = (medida === "m2" ? "Precio de venta por m², " : "Precio medio de venta, ") + anios(s.puntos);
  const pts = s.puntos.map((p) => ({ x: p.anio, y: p[medida], et: medida === "m2" ? p.texto_m2 : p.texto_medio, nombre: String(p.anio) }));
  const fmt = (y) => numero(y, 0) + " €";
  const ultimo = pts.length ? pts[pts.length - 1].x : null;
  const svg = svgLineas([{ nombre: titulo, color: colorTema("precio_venta"), pts }], pts[0].x, ultimo, 1, fmt, titulo, [2015, 2024, ultimo]);
  const tabla = tablaHtml(["Año", "Por m²", "Precio medio"], s.puntos.map((p) => [p.anio, esc(p.texto_m2), esc(p.texto_medio)]));
  return htmlGrafico(titulo, svg, tabla, s.notas, s.fuente);
}

// La subida del precio de venta de 2015 a 2024, con la diferencia en euros, junto a la del salario y la del IPC; debajo,
// plegada, la serie entera. medida = m2 o medio
function htmlVariacionVenta(f, medida) {
  const s = f.salarios, serie = (f.series || {}).venta;
  const nombres = { m2: "Precio de venta por m²", medio: "Precio medio de venta" };
  const cifra = (m, que) => estado.cifras.get("precio_venta_" + m + "_" + que.replace("A0", ANIOS_VENTA[0]).replace("A1", ANIOS_VENTA[1]));
  const texto = (m, que) => { const x = cifra(m, que); return x ? esc(x.texto) : "sin dato"; };
  const titulo = nombres[medida] + ": subida de " + ANIOS_VENTA[0] + " a " + ANIOS_VENTA[1] + ", junto al salario y los precios";
  const pie = serie ? plegado("Ver la serie entera, " + anios(serie.puntos), htmlSerieVenta(serie, medida)) : "";
  const propia = cifra(medida, "variacion_pct_A0_A1");
  if (!propia || propia.valor == null || !s) {
    const avisos = propia ? propia.avisos.map((i) => f.avisos[i]) : [];
    return htmlGrafico(titulo, '<p class="sin-grafico">Este lugar no tiene la subida del precio de venta.' + (avisos.length ? " ⚠ " + esc(avisos.join("; ")) : "") + "</p>", null, [], null, "", pie);
  }
  const orden = medida === "m2" ? ["m2", "medio"] : ["medio", "m2"];
  const filas = [];
  for (const m of orden) {
    const x = cifra(m, "variacion_pct_A0_A1");
    if (x && x.valor != null) filas.push({ etiqueta: nombres[m], valor: x.valor, texto: x.texto, color: m === medida ? colorTema("precio_venta") : AZUL_CLARO, destacada: m === medida });
  }
  filas.push({ etiqueta: "Salario mediano (" + s.ambito + ")", valor: s.salario.variacion, texto: s.salario.texto, color: "#3a3a38" });
  filas.push({ etiqueta: "Precios (IPC de " + s.ipc.ambito + ")", valor: s.ipc.variacion, texto: s.ipc.texto, color: "#8a8880" });
  const tabla = tablaHtml(["", String(ANIOS_VENTA[0]), String(ANIOS_VENTA[1]), "Diferencia", "Subida"],
    orden.map((m) => [nombres[m], texto(m, "A0"), texto(m, "A1"), texto(m, "diferencia_A0_A1"), texto(m, "variacion_pct_A0_A1")]).concat([
      ["Salario mediano bruto al año (" + esc(s.ambito) + ")", esc(s.salario.texto_inicio), esc(s.salario.texto_fin), esc(s.salario.texto_diferencia), esc(s.salario.texto)],
      ["Índice de precios de consumo (media anual; 2025 = 100; " + esc(s.ipc.ambito) + ")", numero(s.ipc.inicio, 1), numero(s.ipc.fin, 1), "—", esc(s.ipc.texto)]]));
  const notas = [NOTA_VENTA].concat(notasSalarioIpc(s));
  if (s.nota) notas.push(s.nota);
  return htmlGrafico(titulo, svgBarras(filas, titulo), tabla, notas, null, "", pie);
}

// Compras por no residentes, cada año de la serie: dos líneas, todos los no residentes y los extranjeros no residentes
function htmlSerieCompras(s, columna) {
  const titulo = "Compras de vivienda por no residentes, en % de las compraventas, " + anios(s.puntos);
  const extranjeros = /extranjeros/.test(columna);
  const linea = (ext) => ({ nombre: ext ? "Extranjeros no residentes" : "Todos los no residentes", color: ext === extranjeros ? colorTema("compras") : AZUL_CLARO,
    pts: s.puntos.map((p) => ({ x: p.anio, y: ext ? p.pct_ext : p.pct_nores, et: ext ? p.texto_pct_ext : p.texto_pct_nores, nombre: String(p.anio) })) });
  const ultimo = s.puntos[s.puntos.length - 1].anio;
  const primero = s.puntos[0].anio;
  const svg = svgLineas([linea(extranjeros), linea(!extranjeros)], primero, ultimo, 1, (y) => numero(y, y % 1 ? 1 : 0) + "%", titulo, [primero, ultimo]);
  const tabla = tablaHtml(["Año", "Compraventas", "Todos los no residentes", "%", "Extranjeros no residentes", "%"],
    s.puntos.map((p) => [p.anio, esc(p.total), esc(p.nores), esc(p.texto_pct_nores), esc(p.ext), esc(p.texto_pct_ext)]));
  return htmlGrafico(titulo, svg, tabla, s.notas, s.fuente);
}
function htmlCompras(f, columna) {
  const s = (f.series || {}).compras;
  const [, a0, a1] = columna.match(/_([0-9]{4})_([0-9]{4})$/);   // los años sumados, del nombre de la columna (…_2022_2025)
  return htmlComparar(f, columna, {
    notas: ["Se mide a quien compra: no hay datos publicados de quien vende. Cifra de " + a0 + " a " + a1 + " juntos: compras de esos años ÷ compraventas de esos años (no es la media de los % de cada año). Cada año, en la serie."],
    pie: s ? plegado("Ver la serie entera, " + anios(s.puntos), htmlSerieCompras(s, columna)) : "" });
}

// Precio por m² según quién compra (Notariado), por semestre: dato secundario, plegado, en España y en las comunidades
function htmlNotariado(s) {
  // España: españoles, extranjeros residentes y no residentes; una comunidad: la suya y la de España
  const colores = s.lineas.length === 2 ? [colorTema("precio_venta"), "#8a8880"] : ["#3a3a38", AZUL_CLARO, colorTema("precio_venta")];
  const titulo = "Precio por m² según quién compra, por semestre";
  const sem = (p) => (p.semestre === 1 ? "1.er" : "2.º") + " semestre de " + p.anio;
  const lineas = s.lineas.map((l, i) => ({ nombre: l.etiqueta, color: colores[i],
    pts: l.puntos.map((p) => ({ x: p.anio + (p.semestre - 1) / 2, y: p.valor, et: p.texto, nombre: sem(p) })) }));
  const todas = s.lineas.concat(s.solo_tabla || []);
  const ultimo = todas[0].puntos[todas[0].puntos.length - 1];
  // La línea que se rotula: los no residentes en España (la tercera), la comunidad en las comunidades (la primera)
  const rotulada = lineas.length === 3 ? [lineas[2], lineas[0], lineas[1]] : lineas;
  const svg = svgLineas(rotulada, todas[0].puntos[0].anio, ultimo.anio + 0.5, 0.5, (y) => numero(y, 0) + " €", titulo, [ultimo.anio + (ultimo.semestre - 1) / 2]);
  const tabla = tablaHtml(["Semestre"].concat(todas.map((l) => l.etiqueta)),
    todas[0].puntos.map((p, k) => [sem(p)].concat(todas.map((l) => l.puntos[k] ? esc(l.puntos[k].texto) : "sin dato"))));
  return plegado("Precio por m² según quién compra (Notariado)", htmlGrafico(titulo, svg, tabla, s.notas, s.fuente));
}

// Lo que la pestaña añade debajo del gráfico: el Notariado
function htmlExtrasCompra(f) {
  const s = f.series || {};
  return s.notariado ? htmlNotariado(s.notariado) : "";
}

// La zona de Urban Audit de una sección (o de un distrito entero) de las 17 ciudades: su precio, que es el de toda la zona
// (decisión del usuario, 23 de octubre de 2026)
function htmlZonaLugar(z) {
  if (z.sin) return '<p class="sin-tema">' + esc(z.sin) + "</p>";
  const c = z.cifras;
  const tabla = tablaHtml(["", "2015", "2024", "Subida"], [
    ["Precio de venta por m²", esc(c.m2_2015.texto), esc(c.m2_2024.texto), esc(c.m2_subida.texto)],
    ["Precio medio de venta", esc(c.medio_2015.texto), esc(c.medio_2024.texto), esc(c.medio_subida.texto)]]);
  return '<section class="grafico"><h2>Precio de venta de su zona: ' + esc(z.titulo) + "</h2><p>" + esc(z.texto) + "</p>" +
    (z.aviso ? '<div class="aviso"><ul><li>⚠ ' + esc(z.aviso) + "</li></ul></div>" : "") + tabla +
    '<ul class="notas"><li>Zonas de Urban Audit: el INE junta secciones censales en zonas de 5.000 a 40.000 habitantes, que define cada ayuntamiento. La zona está marcada en el mapa.</li>' +
    "<li>" + esc(NOTA_VENTA) + " Euros de cada año, sin descontar la inflación.</li>" +
    "<li>Subida: cálculo de esta página con los precios del INE; no está en la descarga.</li>" +
    "<li>Fuente: INE, Indicadores Urbanos: precio medio de compraventa de la vivienda libre (datos notariales), zonas de Urban Audit (tabla 69337); secciones de cada zona: INE, Indicadores Urbanos, ámbitos territoriales (edición 2026).</li></ul></section>";
}
// Por qué no hay precio de venta en este nivel; en las 17 ciudades, la zona del lugar y el enlace al mapa de zonas
function htmlNotaCompra(f) {
  if (!f.compra) return "";
  return '<p class="sin-tema">' + esc(f.compra.nota) + "</p>" + (f.compra.zona ? htmlZonaLugar(f.compra.zona) : "") +
    (f.compra.zonas ? '<p class="sin-tema"><a href="' + direccion("municipio", f.compra.zonas.enlace.split("/").pop()) + '">' + esc(f.compra.zonas.texto) + "</a></p>" : "");
}

// Viviendas construidas por año: columnas, con la media que se usa en la ficha marcada
// De España a provincia (Ministerio), libres y protegidas apiladas, como en 3l (pedido por el usuario el 25 de octubre
// de 2026). `columna`: la media que marca la línea (la de todas las construidas o la de las protegidas)
const VERDE_PROTEGIDAS = "#1baf7a";   // cesion en colores_proyecto: verde = vivienda protegida, como en los pósteres
// Con la media de las protegidas, solo las protegidas, con su escala: con las libres, su media quedaba pegada al eje
function htmlConstruccion(s, columna) {
  if (!s) return htmlGrafico("Viviendas construidas por año", '<p class="sin-grafico">Sin datos de construcción para esta área.</p>', null, [], null);
  if (columna === "construidas_protegidas_al_anio" && s.protegidas) {
    s = Object.assign({}, s, { titulo: "Viviendas protegidas terminadas cada año", valores: s.protegidas, textos: s.textos_protegidas, total: s.textos,
      libres: null, solo_protegidas: true });
  }
  const W = anchoGrafico(), H = estrecha() ? 230 : 260, m = { izq: 56, der: 12, arr: 34, abj: 30 };
  const x0 = s.anios[0], x1 = s.anios[s.anios.length - 1];
  const ancho = (W - m.izq - m.der) / (x1 - x0 + 1);
  const sx = (a) => m.izq + (a - x0 + 0.5) * ancho;
  const deProtegidas = columna === "construidas_protegidas_al_anio";
  const media = estado.cifras.get(columna || "construidas_al_anio"), periodo = estado.cifras.get("construidas_periodo");
  const { g: base, sy } = marco(W, H, m, Math.max(1, ...s.valores, media && media.valor ? media.valor : 0),
    (y) => y.toLocaleString("es-ES"), x0, x1, sx, W < 480 ? 10 : 5);
  let g = base;
  const apiladas = !!(s.libres && s.protegidas);
  const color = s.solo_protegidas ? VERDE_PROTEGIDAS : s.tipo === "ministerio" ? "#3a3a38" : "#a8a6a0";
  const barra = (a, y0, y1, fill, titulo) => '<rect x="' + (sx(a) - ancho * 0.4) + '" y="' + y1 + '" width="' + ancho * 0.8 + '" height="' + Math.max(y0 - y1, 0) +
    '" fill="' + fill + '"><title>' + esc(titulo) + "</title></rect>";
  s.anios.forEach((a, i) => {
    if (apiladas) {
      const titulo = a + ": " + s.textos[i] + " viviendas (" + s.textos_libres[i] + " libres y " + s.textos_protegidas[i] + " protegidas)";
      g += barra(a, sy(0), sy(s.libres[i]), color, titulo) + barra(a, sy(s.libres[i]), sy(s.valores[i]), VERDE_PROTEGIDAS, titulo);
    } else {
      const y = sy(s.valores[i]);
      g += '<rect x="' + (sx(a) - ancho * 0.4) + '" y="' + y + '" width="' + ancho * 0.8 + '" height="' + Math.max(H - m.abj - y, 0) + '" rx="1.5" fill="' + color + '"><title>' + a + ": " + esc(s.textos[i]) +
        (s.solo_protegidas ? " protegidas, de " + esc(s.total[i]) + " terminadas" : " viviendas") + "</title></rect>";
    }
  });
  const anios = periodo && /(\d{4})\D+(\d{4})/.exec(periodo.texto);
  if (media && media.valor != null && anios) {
    const a0 = +anios[1], a1 = +anios[2], y = sy(media.valor);
    g += '<line x1="' + (sx(a0) - ancho / 2) + '" x2="' + (sx(a1) + ancho / 2) + '" y1="' + y + '" y2="' + y + '" stroke="' + (deProtegidas ? TINTA : colorTema("anios_")) + '" stroke-width="2"' +
      (deProtegidas ? ' stroke-dasharray="4 3"' : "") + "/>" +
      '<text x="' + (sx(a1) + ancho / 2) + '" y="' + (y - 6) + '" text-anchor="end" font-size="12" font-weight="600" fill="' + TINTA + '" stroke="#fff" stroke-width="3" paint-order="stroke">' +
      (deProtegidas ? "media de protegidas " : "media ") + a0 + "–" + a1 + ": " + esc(media.texto) + "</text>";
  }
  const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(s.titulo) + '">' + g + "</svg>";
  const cuadro = (c) => '<svg width="14" height="14" aria-hidden="true"><rect width="14" height="14" fill="' + c + '"/></svg> ';
  const leyenda = apiladas ? '<div class="leyenda-meses"><span>' + cuadro(VERDE_PROTEGIDAS) + "Protegidas (calificación definitiva)</span><span>" + cuadro(color) + "Libres</span></div>" : "";
  const tabla = apiladas
    ? tablaHtml(["Año", "Libres", "Protegidas", "Total"], s.anios.map((a, i) => [a, esc(s.textos_libres[i]), esc(s.textos_protegidas[i]), esc(s.textos[i])]))
    : s.solo_protegidas ? tablaHtml(["Año", "Protegidas", "Total de terminadas"], s.anios.map((a, i) => [a, esc(s.textos[i]), esc(s.total[i])]))
    : tablaHtml(["Año", "Viviendas"], s.anios.map((a, i) => [a, esc(s.textos[i])]));
  const nota = !(media && anios) ? [] : deProtegidas
    ? ["La línea discontinua es la media de las viviendas protegidas en los mismos años que la media de todas las construidas."]
    : ["La línea es la media que usa la ficha para los años de construcción y el ritmo por cada mil viviendas."];
  return htmlGrafico(s.titulo, svg, tabla, s.notas.concat(nota), s.fuente, leyenda);
}

// Anuncios de temporada (pedido por el usuario el 22 de octubre de 2026): una línea de 0% (todos los anuncios de larga
// estancia) a 100% (todos de temporada) por área, con el punto de cada periodo y una flecha del primero al segundo;
// el lugar en color y su comunidad y España en gris
function htmlTemporada(s) {
  const titulo = "Anuncios de alquiler de temporada, en % de todos los anuncios";
  if (!s) return htmlGrafico(titulo, '<p class="sin-grafico">elDiario.es solo cuenta los anuncios de las 52 capitales de provincia, y este lugar no es una de ellas.</p>', null, [], null, "", htmlCita());
  const W = anchoGrafico(), izq = 52, der = 52, cab = 26, alto = 64;
  const H = cab + s.filas.length * alto + 6;
  const sx = (p) => izq + (p / 100) * (W - izq - der);
  let g = "";
  // Rejilla y extremos: 0% = todo larga estancia, 100% = todo temporada
  for (const p of [0, 25, 50, 75, 100]) {
    g += '<line x1="' + sx(p) + '" x2="' + sx(p) + '" y1="' + (cab - 4) + '" y2="' + (H - 4) + '" stroke="' + REJILLA + '"' + (p % 100 ? ' stroke-dasharray="3 3"' : "") + "/>";
    if (p % 100) g += '<text x="' + sx(p) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="' + TINTA_SUAVE + '">' + p + "%</text>";
  }
  // En pantallas estrechas, rótulos cortos para que no se pisen
  const [r0, r100] = W < 480 ? ["← 0%: larga estancia", "100%: temporada →"] : ["← 0%: todo larga estancia", "100%: todo temporada →"];
  g += '<text x="' + sx(0) + '" y="14" font-size="12" fill="' + TINTA_SUAVE + '">' + r0 + "</text>" +
    '<text x="' + sx(100) + '" y="14" text-anchor="end" font-size="12" fill="' + TINTA_SUAVE + '">' + r100 + "</text>";
  s.filas.forEach((r, i) => {
    const y0 = cab + i * alto, yl = y0 + 46;
    const color = r.destacada ? colorTema("anuncios_") : "#8a8880";
    g += '<text x="' + izq + '" y="' + (y0 + 16) + '" font-size="13" fill="' + TINTA + '"' + (r.destacada ? ' font-weight="700"' : "") + ">" + esc(r.titulo) + "</text>" +
      '<text x="' + (W - der) + '" y="' + (y0 + 16) + '" text-anchor="end" font-size="13" font-weight="600" fill="' + TINTA + '">' + esc(r.texto_puntos) + "</text>";
    // La línea entera, con topes en 0% y 100%
    g += '<line x1="' + sx(0) + '" x2="' + sx(100) + '" y1="' + yl + '" y2="' + yl + '" stroke="' + GRIS + '" stroke-width="2"/>' +
      [0, 100].map((p) => '<line x1="' + sx(p) + '" x2="' + sx(p) + '" y1="' + (yl - 6) + '" y2="' + (yl + 6) + '" stroke="' + GRIS + '" stroke-width="2"/>').join("");
    const xa = sx(r.antes), xb = sx(r.despues), sg = xb >= xa ? 1 : -1;
    // Flecha del primer periodo al segundo, si hay sitio entre los dos puntos
    if (Math.abs(xb - xa) > 16) {
      const punta = xb - sg * 7;
      g += '<line x1="' + (xa + sg * 6) + '" x2="' + (punta - sg * 5) + '" y1="' + yl + '" y2="' + yl + '" stroke="' + color + '" stroke-width="2.5"/>' +
        '<polygon points="' + punta + "," + yl + " " + (punta - sg * 8) + "," + (yl - 5) + " " + (punta - sg * 8) + "," + (yl + 5) + '" fill="' + color + '"/>';
    }
    g += '<circle cx="' + xa + '" cy="' + yl + '" r="5" fill="#fff" stroke="' + color + '" stroke-width="2"><title>' + esc(r.titulo + ", " + s.periodos[0] + ": " + r.texto_antes) + "</title></circle>" +
      '<circle cx="' + xb + '" cy="' + yl + '" r="6" fill="' + color + '"><title>' + esc(r.titulo + ", " + s.periodos[1] + ": " + r.texto_despues) + "</title></circle>";
    // Cifras encima de la línea, para que no las tache, y por fuera de los puntos: la menor a la izquierda y la mayor
    // a la derecha, para que no se pisen
    const [xi, ti, xd, td] = xa <= xb ? [xa, r.texto_antes, xb, r.texto_despues] : [xb, r.texto_despues, xa, r.texto_antes];
    // Con un borde blanco, para que tampoco las tache la rejilla
    const halo = ' stroke="#fff" stroke-width="3" paint-order="stroke"';
    g += '<text x="' + (xi - 3) + '" y="' + (yl - 10) + '" text-anchor="end" font-size="12" fill="' + TINTA + '"' + halo + ">" + esc(ti) + "</text>" +
      '<text x="' + (xd + 3) + '" y="' + (yl - 10) + '" font-size="12" font-weight="600" fill="' + TINTA + '"' + halo + ">" + esc(td) + "</text>";
  });
  const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + g + "</svg>";
  const c = colorTema("anuncios_");
  const leyenda = '<div class="leyenda-meses"><span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="#fff" stroke="' + c + '" stroke-width="2"/></svg> ' +
    esc(s.periodos[0]) + '</span><span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="' + c + '"/></svg> ' + esc(s.periodos[1]) +
    "</span><span>A la derecha, el cambio</span></div>";
  const tabla = tablaHtml(["Área", "Periodo", "Anuncios de larga estancia (media al mes)", "Anuncios de temporada (media al mes)", "% de temporada"],
    s.filas.flatMap((r) => [
      [r.enlace ? '<a href="' + r.enlace + '">' + esc(r.titulo) + "</a>" : esc(r.titulo), esc(s.periodos[0]), esc(r.larga_antes), esc(r.temp_antes), esc(r.texto_antes)],
      ["", esc(s.periodos[1]), esc(r.larga_despues), esc(r.temp_despues), esc(r.texto_despues) + " (" + esc(r.texto_puntos) + ")"]]));
  return htmlGrafico(titulo, svg, tabla, s.notas, s.fuente, leyenda, htmlCita());
}

// --- Rangos (prompt 11; decisiones del usuario, 24 de octubre de 2026) ------------------------------------------------

// Una cifra entre las áreas que contiene el lugar (los municipios con precio de una provincia, las provincias de España):
// cada área es una bola en una línea de la cifra más baja a la más alta, del color de su clase en el mapa y de tamaño
// según su población; con nombre, las más pobladas y, si hay muchas, la más alta y la más baja. Pieza común: dibuja
// cualquier cifra que preparar_datos.R dé en `rangos` (ver «Rangos» allí). Al pasar por una bola se marca su área en el
// mapa, y al pasar por el mapa, su bola (marcarEnRangos). `refs`: líneas discontinuas ({ valor, texto, nombre, color }).
const anchoTexto = (s) => s.length * 6.4 + 6;   // ancho aproximado de un texto de 12 px
function svgRango(gr, c, refs, titulo) {
  const W = anchoGrafico(), alto = 15;
  const n = c.i.length;
  const pmax = Math.max(...c.i.map((k) => gr.pesos[k]));
  const rmax = n > 60 ? (estrecha() ? 9 : 12) : (estrecha() ? 12 : 16);
  const radio = (k) => Math.max(2.5, rmax * Math.sqrt(gr.pesos[k] / pmax));   // el área de la bola, proporcional a la población
  // Eje: de la más baja a la más alta, con las referencias y, en las subidas, con el 0
  const vals = c.v.concat(refs.map((r) => r.valor), c.subida ? [0] : []);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const paso = pasoEje(hi - lo || Math.abs(hi) || 1);
  lo = Math.floor(lo / paso) * paso; hi = Math.ceil(hi / paso) * paso;
  if (hi - lo < paso) { lo -= paso; hi += paso; }
  // Rótulos del eje, centrados en su raya; a los lados, sitio para la mitad del primero y del último, que si no se cortan
  const d = paso < 1 ? 1 : 0;
  const marcasEje = [];
  for (let x = lo; x <= hi + 1e-9; x += paso) marcasEje.push([x, (c.subida && x > 1e-9 ? "+" : "") + numero(x, d) + c.unidad]);
  const izq = Math.max(12, anchoTexto(marcasEje[0][1]) / 2), der = Math.max(12, anchoTexto(marcasEje[marcasEje.length - 1][1]) / 2);
  const sx = (x) => izq + ((x - lo) / (hi - lo)) * (W - izq - der);
  // Rótulos, de izquierda a derecha, en la primera fila libre: encima, debajo, otra encima…
  const rot = c.rotular.map((k) => { const j = c.i.indexOf(k); return { k, x: sx(c.v[j]), r: radio(k), nombre: gr.nombres[k], cifra: c.t[j] }; })
    .sort((a, b) => a.x - b.x);
  const ocupado = [];
  for (const r of rot) {
    const w = anchoTexto(r.nombre + " " + r.cifra);
    r.lx = Math.min(Math.max(r.x, izq + w / 2), W - der - w / 2);
    const a = r.lx - w / 2 - 4, b = r.lx + w / 2 + 4;
    r.fila = [0, 1, 2, 3, 4, 5].find((q) => !(ocupado[q] || []).some(([x0, x1]) => a < x1 && b > x0));
    if (r.fila === undefined) r.fila = 0;
    (ocupado[r.fila] = ocupado[r.fila] || []).push([a, b]);
  }
  const nArriba = Math.max(0, ...rot.filter((r) => r.fila % 2 === 0).map((r) => r.fila / 2 + 1));
  const nAbajo = Math.max(0, ...rot.filter((r) => r.fila % 2 === 1).map((r) => (r.fila + 1) / 2));
  const y0 = 18 + nArriba * alto + rmax + 6;   // arriba, sitio para el rótulo de la bola marcada
  const yArriba = (q) => y0 - rmax - 8 - q * alto, yAbajo = (q) => y0 + rmax + 18 + q * alto;
  const yEje = y0 + rmax + 10 + nAbajo * alto + 14;
  const H = yEje + 6;
  let s = "";
  for (const [x, rotulo] of marcasEje) {
    s += '<line x1="' + sx(x) + '" x2="' + sx(x) + '" y1="' + (y0 - rmax - 2) + '" y2="' + (y0 + rmax + 2) + '" stroke="' + (Math.abs(x) < 1e-9 && lo < 0 ? TINTA_SUAVE : REJILLA) + '"/>' +
      '<text x="' + sx(x) + '" y="' + yEje + '" text-anchor="middle" font-size="12" fill="' + TINTA_SUAVE + '">' + esc(rotulo) + "</text>";
  }
  s += '<line x1="' + sx(c.v[0]) + '" x2="' + sx(c.v[n - 1]) + '" y1="' + y0 + '" y2="' + y0 + '" stroke="#d9d7d0" stroke-width="6" stroke-linecap="round"/>';
  for (const r of refs) s += '<line x1="' + sx(r.valor) + '" x2="' + sx(r.valor) + '" y1="' + (y0 - rmax - 4) + '" y2="' + (y0 + rmax + 4) + '" stroke="' + r.color + '" stroke-width="1.5" stroke-dasharray="4 3"><title>' + esc(r.nombre + ": " + r.texto) + "</title></line>";
  // Las bolas grandes primero, para que las pequeñas queden encima
  const orden = c.i.map((k, j) => j).sort((a, b) => radio(c.i[b]) - radio(c.i[a]));
  for (const j of orden) {
    const k = c.i[j], cl = c.clases[c.k[j] - 1];
    s += '<circle class="bola" cx="' + sx(c.v[j]) + '" cy="' + y0 + '" r="' + radio(k) + '" fill="' + (cl ? cl.color : SIN_DATO) +
      '" fill-opacity="0.9" stroke="rgba(0,0,0,0.4)" stroke-width="0.75" data-codigo="' + gr.codigos[k] + '" data-et="' + esc(gr.nombres[k] + " " + c.t[j]) + '">' +
      "<title>" + esc(gr.nombres[k] + ": " + c.t[j] + " (" + gr.textos_peso[k] + " habitantes)") + "</title></circle>";
  }
  const halo = ' stroke="#fff" stroke-width="3" paint-order="stroke"';
  for (const r of rot) {
    const arriba = r.fila % 2 === 0, q = Math.floor(r.fila / 2);
    const yb = arriba ? yArriba(q) : yAbajo(q);
    s += '<line x1="' + r.x + '" x2="' + r.lx + '" y1="' + (arriba ? y0 - r.r : y0 + r.r) + '" y2="' + (arriba ? yb + 3 : yb - 11) + '" stroke="' + TINTA_SUAVE + '" stroke-width="0.75"/>' +
      '<text x="' + r.lx + '" y="' + yb + '" text-anchor="middle" font-size="12" fill="' + TINTA + '"' + halo + ">" + esc(r.nombre) +
      ' <tspan font-weight="700">' + esc(r.cifra) + "</tspan></text>";
  }
  return '<svg class="rango-svg" data-nivel="' + gr.nivel + '" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(titulo) + '">' + s +
    '<g class="resaltes" pointer-events="none"></g></svg>';
}

// El gráfico de una cifra de `rangos`, con su leyenda, su tabla y sus notas; en las subidas, con la del salario y la del IPC
function htmlRango(f, columna) {
  const c = f.rangos.cifras[columna], gr = f.rangos.grupos[c.grupo], s = f.salarios;
  const refs = c.subida && s ? [
    { valor: s.salario.variacion, texto: s.salario.texto, nombre: "Salario mediano (" + s.ambito + ")", color: "#3a3a38" },
    { valor: s.ipc.variacion, texto: s.ipc.texto, nombre: "Precios (IPC de " + s.ipc.ambito + ")", color: "#8a8880" }] : [];
  const presentes = c.clases.filter((x, j) => c.k.indexOf(j + 1) >= 0);
  const leyenda = '<div class="leyenda-meses">' + presentes.map((x) => '<span><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="6" fill="' +
    x.color + '" stroke="rgba(0,0,0,0.4)" stroke-width="0.75"/></svg> ' + esc(x.rotulo) + "</span>").join("") +
    refs.map((r) => '<span><svg width="14" height="14" aria-hidden="true"><line x1="7" x2="7" y1="0" y2="14" stroke="' + r.color +
      '" stroke-width="2" stroke-dasharray="3 2"/></svg> ' + esc(r.nombre + ": " + r.texto) + "</span>").join("") + "</div>";
  const filas = c.i.map((k, j) => j).sort((a, b) => c.v[b] - c.v[a]).map((j) => {
    const k = c.i[j];
    return ['<a href="' + direccion(gr.nivel, gr.codigos[k]) + '">' + esc(gr.nombres[k]) + "</a>", esc(c.t[j]), esc(gr.textos_peso[k])];
  });
  const tabla = tablaHtml(["Área", "Cifra", "Habitantes"], filas);
  let notas = c.notas.slice();
  if (refs.length) notas.push("Líneas discontinuas: la subida del salario mediano y la de los precios, de " + s.anio_inicio + " a " + s.anio_fin + ".", ...notasSalarioIpc(s));
  notas = notas.filter((x, j) => notas.indexOf(x) === j);
  // Las notas y la fuente, plegadas: son muchas (pedido por el usuario el 24 de octubre de 2026)
  const pie = plegado("Cómo leer el gráfico, notas y fuente", '<ul class="notas">' + notas.map((x) => "<li>" + esc(x) + "</li>").join("") +
    "<li>Fuente: " + esc(c.fuente) + ".</li></ul>");
  return htmlGrafico(c.titulo, svgRango(gr, c, refs, c.titulo), tabla, [], null, leyenda, pie);
}
// La cifra y, debajo, la que va con ella (la subida con el precio de 2024, y al revés)
function htmlRangos(f, columna) {
  const c = f.rangos.cifras[columna];
  return htmlRango(f, columna) + (c.con && f.rangos.cifras[c.con] ? htmlRango(f, c.con) : "");
}

// Marca un área en todos los gráficos de rangos de la ficha (un anillo y su nombre con su cifra), o quita la marca
function marcarEnRangos(codigo, encendida) {
  document.querySelectorAll(".rango-svg").forEach((svg) => {
    const capa = svg.querySelector(".resaltes");
    capa.innerHTML = "";
    const b = encendida && svg.querySelector('circle.bola[data-codigo="' + codigo + '"]');
    if (!b) return;
    const x = +b.getAttribute("cx"), y = +b.getAttribute("cy"), r = +b.getAttribute("r");
    const et = b.getAttribute("data-et"), w = anchoTexto(et), W = svg.viewBox.baseVal.width;
    capa.innerHTML = '<circle cx="' + x + '" cy="' + y + '" r="' + (r + 3) + '" fill="none" stroke="' + TINTA + '" stroke-width="2"/>' +
      '<text x="' + Math.min(Math.max(x, w / 2 + 2), W - w / 2 - 2) + '" y="' + Math.max(13, y - r - 7) + '" text-anchor="middle" font-size="12" font-weight="700" fill="' +
      TINTA + '" stroke="#fff" stroke-width="4" paint-order="stroke">' + esc(et) + "</text>";
  });
}
// Marca un área en el mapa, si está en el mapa que se ve
function marcarEnMapa(codigo, encendida) {
  const capa = estado.porCodigo.get(codigo);
  if (!capa) return;
  if (encendida) { capa.setStyle({ color: "#000", weight: 3, dashArray: null }); capa.bringToFront(); circulosDelante(); capa.openTooltip(); }
  else { capa.setStyle(estilo(capa.feature)); capa.closeTooltip(); }
}

function htmlGraficoVariable(f, v) {
  // Una cifra que el lugar no tiene: el rango de las áreas que contiene; si la tiene y hay rango, va debajo
  const x = estado.cifras.get(v.columna);
  const rango = f.rangos && f.rangos.cifras[v.columna];
  if (rango && x && x.rango) return htmlRangos(f, v.columna);
  return graficoPropio(f, v) + (rango ? htmlRangos(f, v.columna) : "");
}
function graficoPropio(f, v) {
  const s = f.series || {};
  const sin = (titulo, por) => htmlGrafico(titulo, '<p class="sin-grafico">' + esc(por) + "</p>", null, [], null);
  const sinTur = () => sin("Viviendas turísticas en el tiempo", "El INE no da viviendas turísticas de esta área en ninguna medición.");
  const sinAlq = () => sin("Alquiler mediano de los pisos en el tiempo", "El Ministerio de Vivienda no da la mediana del alquiler de esta área en ningún año (muy pocos pisos en la muestra, o ningún alquiler declarado).");
  switch (v.grafico) {
    case "turisticas_pct": return s.turisticas ? htmlSerieTuristicas(s.turisticas, "pct") : sinTur();
    case "turisticas_por100": return s.turisticas ? htmlSerieTuristicas(s.turisticas, "por100") : sinTur();
    case "turisticas_por100p": return s.turisticas ? htmlSerieTuristicas(s.turisticas, "por100p") : sinTur();
    case "turisticas_num": return s.turisticas ? htmlSerieTuristicas(s.turisticas, "num") : sinTur();
    case "alquiler_m2": return s.alquiler ? htmlSerieAlquiler(s.alquiler, "m2") : sinAlq();
    case "alquiler_mes": return s.alquiler ? htmlSerieAlquiler(s.alquiler, "mes") : sinAlq();
    case "variacion": return htmlVariacion(f, v.columna);
    case "construccion": return htmlConstruccion(s.construccion);
    case "construccion_protegidas": return htmlConstruccion(s.construccion, v.columna);
    case "comparar": return htmlComparar(f, v.columna);
    case "temporada": return htmlTemporada(s.temporada);
    case "venta_m2": return htmlVariacionVenta(f, "m2");
    case "venta_medio": return htmlVariacionVenta(f, "medio");
    case "compras": return htmlCompras(f, v.columna);
    default: return "";
  }
}

// --- Ficha -----------------------------------------------------------------------------------------------

// Sin la tabla de todo el nivel en ningún nivel (decisión del usuario: el 21 de octubre de 2026, en distritos y
// secciones; el 23 de octubre de 2026, en todos). El archivo se sigue escribiendo y comprobando.
function htmlDescargas(f) {
  return '<section class="descargas"><h2>Descargar</h2>' +
    '<button type="button" id="descargar-lugar">Datos de este lugar (CSV)</button>' +
    "<p>Las cifras van sin redondear, como en las tablas del proyecto, y cada una con sus avisos. " +
    '<a href="' + DATOS + 'descargas/descripcion_datos_' + f.nivel + '.txt">Qué es cada columna</a>.' +
    " No llevan las cifras calculadas para esta página (lo dice el «qué es» de cada una) ni las series de los gráficos." +
    (f.descarga.nota ? " " + esc(f.descarga.nota) : "") + "</p></section>";
}

function pintarCabeza() {
  const f = estado.ficha, tema = temaActual();
  let h = "";
  if (f.ruta.length) h += '<p class="migas">' + f.ruta.map((r) => '<a href="' + r.enlace + '">' + esc(r.titulo) + "</a>").join(" › ") + "</p>";
  h += "<h1 data-titulo=\"" + esc(f.titulo) + "\">" + (f.cabecera ? esc(f.cabecera.texto) + " <small class=\"codigo\">" + esc(f.cabecera.codigo) + "</small>" : esc(f.titulo)) + "</h1>";
  if (f.nivel === "nacional") h += '<p class="entrada">Elige un tema arriba y un lugar en el mapa, o búscalo. Cada cifra lleva al lado sus avisos, y cada gráfico, su fuente.</p>';
  // Un botón por cifra y, si la elegida tiene varias bases, el selector de la base (decisión del usuario, 18 de
  // octubre de 2026). Cada base es una variable, con su tarjeta, su gráfico y su mapa.
  const grupos = gruposDisponibles(), actual = variableActual();
  const gActual = grupos.find((g) => g.vars.indexOf(actual) >= 0);
  if (grupos.length) {
    h += '<div class="variables" role="radiogroup" aria-label="' + esc(tema.titulo) + ': cifra del mapa y del primer gráfico">' +
      grupos.map((g) => '<button type="button" role="radio" data-grupo="' + esc(g.nombre) + '" aria-checked="' + (g === gActual) + '"' +
        estiloColor(g.vars[0].columna) + ">" + esc(g.nombre) + "</button>").join("") + "</div>";
  }
  if (gActual && gActual.vars.length > 1) {
    h += '<div class="bases" role="radiogroup" aria-label="' + esc(gActual.nombre) + ': medida"' + estiloColor(gActual.vars[0].columna) +
      '><span class="bases-titulo">Medida:</span>' +
      gActual.vars.map((v) => '<button type="button" role="radio" data-columna="' + v.columna + '" aria-checked="' + (v === actual) + '">' +
        esc(v.nombre) + "</button>").join("") + "</div>";
  }
  $("cabeza").innerHTML = h;
  // Al cambiar de cifra se conserva la base, si la nueva cifra la tiene
  $("cabeza").querySelectorAll(".variables button").forEach((b) => b.addEventListener("click", () => {
    const g = grupos.find((x) => x.nombre === b.dataset.grupo);
    if (g === gActual) return;
    elegirVariable((g.vars.find((v) => actual && v.nombre === actual.nombre) || g.vars[0]).columna);
  }));
  $("cabeza").querySelectorAll(".bases button").forEach((b) => b.addEventListener("click", () => elegirVariable(b.dataset.columna)));
}

function pintarFicha() {
  const f = estado.ficha, col = estado.col, tema = temaActual();
  pintarCabeza();
  const antes = performance.now();
  let h = "";
  if (f.sin_datos) h += '<div class="aviso sin-datos">' + esc(f.sin_datos) + "</div>";
  const disp = variablesDisponibles(), v = variableActual();
  const enCompra = tema.id === "compra";
  if (!v) {
    h += '<p class="sin-tema">Este tema no tiene cifras para ' + NOMBRE_NIVEL[f.nivel] + ".</p>";
    if (enCompra) h += htmlNotaCompra(f);
  } else {
    h += htmlTarjeta(f, v, true);
    if (enCompra) h += htmlNotaCompra(f);
    h += htmlGraficoVariable(f, v);
    if (enCompra) h += htmlExtrasCompra(f);
    if (tema.id === "vacias" && hayVacias()) h += htmlInfoVacias(estado.infoVacias);
    if (tema.id === "turisticas" && estado.temas.info_turisticas) h += htmlInfoTuristicas(estado.infoTuristicas);
    const otras = disp.filter((x) => x.columna !== v.columna);
    if (tema.id === "resumen") {
      h += '<h2 class="sub">De un vistazo</h2>' + htmlDestacadas(f);
    } else if (otras.length) {
      h += '<h2 class="sub">Otras cifras de este tema</h2><div class="tarjetas">' + otras.map((x) => htmlTarjeta(f, x, false)).join("") + "</div>";
    }
    // Las otras pestañas que hablan de vacías llevan a ese apartado
    if (["resumen", "poco_uso", "construccion"].indexOf(tema.id) >= 0 && hayVacias()) h += htmlEnlaceVacias();
  }
  // Los bloques, cada uno plegable y sin desplegable alrededor: primero los del tema y después los demás
  const delTema = f.bloques.filter((b) => tema.bloques.indexOf(b.id) >= 0);
  const resto = f.bloques.filter((b) => tema.bloques.indexOf(b.id) < 0);
  if (delTema.length) h += '<h2 class="lista">Cifras de este tema</h2>' + delTema.map((b) => htmlBloque(f, b, col)).join("");
  if (resto.length) h += '<h2 class="lista">Otras cifras de este lugar</h2>' + resto.map((b) => htmlBloque(f, b, col)).join("");
  h += htmlDescargas(f);
  const zona = $("ficha");
  zona.innerHTML = h;
  performance.measure("pintar_ficha", { start: antes });
  conectarFicha(zona, f, col);
  colocarCasillas(zona);
  // botón «Gráficos de <lugar>», si el lugar tiene gráficos en esta pestaña (graficos.js)
  if (window.pintarGraficosLugar) pintarGraficosLugar(f, tema);
}

function conectarFicha(zona, f, col) {
  zona.querySelectorAll(".boton-que-es").forEach((b) => b.addEventListener("click", () => {
    const texto = b.closest(".cifra").querySelector(".que-es");
    texto.hidden = !texto.hidden;
    b.setAttribute("aria-expanded", String(!texto.hidden));
  }));
  zona.querySelectorAll("[data-ir-vacias]").forEach((b) => b.addEventListener("click", irAInfoVacias));
  const info = $("info-vacias");
  if (info) info.addEventListener("toggle", () => { estado.infoVacias = info.open; });
  const infoTur = $("info-turisticas");
  if (infoTur) infoTur.addEventListener("toggle", () => { estado.infoTuristicas = infoTur.open; });
  // Gráficos de rangos: al pasar por una bola se marca en el mapa y en los demás gráficos; al pulsarla, su ficha
  zona.querySelectorAll(".rango-svg circle.bola").forEach((b) => {
    const codigo = b.getAttribute("data-codigo");
    b.addEventListener("mouseenter", () => { marcarEnRangos(codigo, true); marcarEnMapa(codigo, true); });
    b.addEventListener("mouseleave", () => { marcarEnRangos(codigo, false); marcarEnMapa(codigo, false); });
    b.addEventListener("click", () => { location.hash = direccion(b.closest(".rango-svg").getAttribute("data-nivel"), codigo); });
  });
  zona.querySelectorAll("[data-elegir]").forEach((b) => b.addEventListener("click", () => {
    elegirVariable(b.dataset.elegir);
    $("cabeza").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  $("descargar-lugar").addEventListener("click", () => {
    const blob = new Blob([aCsv(filasDescarga(f, col))], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "datos_" + f.nivel + "_" + f.codigo + ".csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });
}

async function verFicha(nivel, codigo) {
  const zona = $("ficha");
  zona.setAttribute("aria-busy", "true");
  let f, col;
  try {
    [f, col] = await Promise.all([cargar("fichas/" + nivel + "/" + codigo + ".json"), cargar("columnas/" + nivel + ".json")]);
  } catch (e) {
    $("cabeza").innerHTML = "";
    zona.innerHTML = '<p class="error">No hay ficha para el código ' + esc(codigo) + " (" + esc(nivel) + ") en esta versión de prueba. " +
      'Solo están España, las comunidades, las provincias y, por debajo, la provincia de Sevilla. <a href="#/">Volver a España</a>.</p>';
    zona.removeAttribute("aria-busy");
    return;
  }
  estado.ficha = f;
  estado.col = col;
  // Cada cifra de la ficha por su columna: texto, valor y avisos (las tarjetas y los gráficos las leen de aquí)
  estado.cifras = new Map();
  f.bloques.forEach((b) => b.cifras.forEach((x) => estado.cifras.set(x.columna, x)));
  ajustarVariable();
  actualizarDireccion();
  pintarPestanas();
  pintarFicha();
  performance.mark("ficha");
  zona.removeAttribute("aria-busy");
  document.title = (nivel === "nacional" ? "" : f.titulo + " · ") + temaActual().titulo + " · Vivienda en España";
  const boton = $("ir-ficha");
  if (estado.desdeMapa && estrecha()) {
    boton.textContent = "Ver la ficha: " + f.titulo;
    boton.hidden = false;
  } else {
    boton.hidden = true;
  }
  estado.desdeMapa = false;
  if (estado.mapa) verMapaDeFicha(f, true);
}

// --- Página de fuentes -----------------------------------------------------------------------------------

async function verFuentes() {
  const d = await cargar("fuentes.json");
  let h = '<div class="fuentes-pagina">' +
    "<p>Las cifras salen de las tablas por nivel del proyecto. Algunas las calcula esta página con columnas de esas tablas: lo dice el «qué es» de cada una; los gráficos usan además las series de las que salen las tablas, el salario mediano y el IPC. Cada bloque de la ficha dice su fuente y su fecha; aquí están todas juntas, con los niveles en que se usa cada una.</p>";
  for (const b of d.bloques) {
    h += "<section><h2>" + esc(b.titulo) + "</h2><ul>" + b.fuentes.map((x) => "<li>" + esc(x.fuente || "sin fuente indicada") +
      (x.fecha ? ", " + esc(x.fecha) : "") + " <span class=\"fuente\">(" + esc(x.niveles) + ")</span></li>").join("") + "</ul>";
    if (b.limites.length) h += "<details><summary>Límites</summary><ul>" + b.limites.map((l) => "<li>" + esc(l) + "</li>").join("") + "</ul></details>";
    if (b.cita) h += htmlCita(b.cita);
    if (b.nota) h += '<p class="fuente">' + esc(b.nota) + "</p>";
    h += "</section>";
  }
  for (const s of d.series) h += "<section><h2>" + esc(s.titulo) + "</h2><p>" + esc(s.fuente) + "</p></section>";
  h += "<section><h2>Descripción de cada columna</h2><ul>" + d.descripciones.map((x) => '<li><a href="' + x.archivo + '">' + esc(x.nivel) + "</a></li>").join("") + "</ul></section>";
  h += "<section><h2>Mapa</h2><p>" + esc(d.mapa) + "</p></section>";
  if (d.licencia) {
    h += '<section id="licencia"><h2>Licencia y condiciones de uso</h2>' + d.licencia.parrafos.map((p) => "<p>" + esc(p) + "</p>").join("") +
      '<p><a rel="license" href="' + esc(d.licencia.enlace.url) + '">' + esc(d.licencia.enlace.texto) + "</a></p></section>";
  }
  h += "</div>";
  abrirVentana("Fuentes y fechas", h);
}

// --- Ventana de «Fuentes» y «Sobre el proyecto» -------------------------------------------------------------------

// Se abre encima de la ficha, que no cambia. Al cerrarla (botón, Esc o fuera de la ventana) se vuelve atrás en el
// historial tantas veces como páginas de la ventana se han abierto; si se entró directamente, a la ficha de detrás.
function abrirVentana(titulo, html) {
  const v = $("ventana");
  $("ventana-titulo").textContent = titulo;
  $("ventana-cuerpo").innerHTML = html;
  $("ventana-cuerpo").scrollTop = 0;
  if (!v.open) { estado.tituloFicha = document.title; v.showModal(); }
  document.title = titulo + " · Vivienda en España";
}

function iniciarVentana() {
  const v = $("ventana");
  $("cerrar-ventana").addEventListener("click", () => v.close());
  v.addEventListener("click", (ev) => { if (ev.target === v) v.close(); });   // fuera del recuadro
  v.addEventListener("close", () => {
    if (!esRutaVentana()) return;   // ya se ha ido a otra dirección
    const pasos = estado.pasosVentana;
    estado.pasosVentana = 0;
    if (pasos > 0) { history.go(-pasos); return; }
    estado.deVentana = false;
    actualizarDireccion();
    document.title = estado.tituloFicha;
    document.querySelectorAll(".enlaces-cabecera a").forEach((a) => a.removeAttribute("aria-current"));
  });
}

const esRutaVentana = () => /^#\/(fuentes|proyecto)\b/.test(location.hash);

// --- Página «Sobre el proyecto»: proyecto personal y comentarios (comentarios.md) --------------------------------

// Textos y enlaces de proyecto.json. El formulario de Google se abre en otra ventana, solo al pulsar el botón (sin cookies de Google
// hasta entonces); la lista de resueltos sale de una hoja pública que escribe una persona: siempre con textContent.
async function verProyecto() {
  const d = await cargar("proyecto.json");
  abrirVentana("Sobre el proyecto", '<div class="proyecto-pagina">' +
    '<div class="proyecto-texto">' + d.texto + "</div>" +
    '<aside class="proyecto-comentar"><h2>Hacer un comentario</h2>' + d.intro_comentarios +
      '<p><a class="boton-formulario" href="' + esc(d.formulario.ver) + '" target="_blank" rel="noopener">Abrir el formulario (se abre en Google)</a></p>' +
      '<div class="aviso-formulario">' + d.aviso_comentarios + "</div></aside>" +
    '<section class="proyecto-resueltos"><h2>Comentarios y dudas resueltos</h2><div id="resueltos"></div></section></div>');
  pintarResueltos(d.hoja_resueltos);
}

// Lector de CSV sencillo (comillas dobles, comas y saltos de línea dentro de las comillas)
function leerCsv(texto) {
  const filas = [];
  let fila = [], campo = "", comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ",") { fila.push(campo); campo = ""; }
    else if (c === "\n") { fila.push(campo.replace(/\r$/, "")); filas.push(fila); fila = []; campo = ""; }
    else campo += c;
  }
  if (campo || fila.length) { fila.push(campo); filas.push(fila); }
  return filas;
}

// Columnas de la hoja, por posición: fecha, tipo, lugar, comentario, respuesta, fecha de la respuesta. La última fila
// de la hoja va primero.
async function pintarResueltos(url) {
  const caja = $("resueltos");
  const mensaje = (t) => { const p = document.createElement("p"); p.className = "sin-tema"; p.textContent = t; caja.replaceChildren(p); };
  if (!url) { mensaje("Todavía no hay ninguno."); return; }
  let filas;
  try {
    const r = await fetch(url);
    if (!r.ok) throw new Error(r.status);
    filas = leerCsv(await r.text()).slice(1).filter((f) => f.some((x) => x.trim()));
  } catch (e) {
    mensaje("No se ha podido leer la lista de comentarios. El formulario sigue funcionando.");
    return;
  }
  if (!filas.length) { mensaje("Todavía no hay ninguno."); return; }
  const lista = document.createElement("ul");
  lista.className = "lista-resueltos";
  for (const [fecha, tipo, lugar, comentario, respuesta, fechaRespuesta] of filas.reverse()) {
    const li = document.createElement("li");
    const parte = (etiqueta, clase, texto) => {
      if (!texto) return;
      const p = document.createElement(etiqueta);
      p.className = clase;
      p.textContent = texto;
      li.appendChild(p);
    };
    parte("p", "fuente", [fecha, tipo, lugar].filter(Boolean).join(" · "));
    parte("blockquote", "comentario", comentario);
    parte("p", "respuesta", respuesta ? "Respuesta" + (fechaRespuesta ? " (" + fechaRespuesta + ")" : "") + ": " + respuesta : "");
    lista.appendChild(li);
  }
  caja.replaceChildren(lista);
}

// --- Buscador --------------------------------------------------------------------------------------------

let indice = null;
const normal = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

async function buscar(q) {
  if (!indice) {
    indice = (await cargar("buscador.json")).map(([t, e, extra]) => ({ t, e, n: normal(t + " " + (extra || "")), nombre: normal(t.replace(/^[^:]*: /, "")) }));
  }
  const nq = normal(q.trim());
  if (!nq) return [];
  const palabras = nq.split(/\s+/);
  const nivelDe = (e) => NIVELES.indexOf(e.split("/")[1]);
  const r = indice.filter((x) => palabras.every((p) => x.n.includes(p)));
  r.sort((a, b) => (b.nombre.startsWith(nq) - a.nombre.startsWith(nq)) || (nivelDe(a.e) - nivelDe(b.e)) || (a.t.length - b.t.length));
  return r.slice(0, 12);
}

function iniciarBuscador() {
  const entrada = $("buscar"), lista = $("resultados");
  let elegido = -1, actuales = [];
  const cerrar = () => { lista.hidden = true; entrada.setAttribute("aria-expanded", "false"); elegido = -1; };
  const ir = (e) => { location.hash = e; entrada.value = ""; cerrar(); entrada.blur(); };
  const marcar = () => lista.querySelectorAll("li").forEach((li, i) => li.setAttribute("aria-selected", String(i === elegido)));
  entrada.addEventListener("focus", () => { cargar("buscador.json").catch(() => {}); });
  entrada.addEventListener("input", async () => {
    const q = entrada.value;
    actuales = await buscar(q);
    if (entrada.value !== q) return;
    if (!q.trim()) { cerrar(); return; }
    lista.innerHTML = actuales.length
      ? actuales.map((x, i) => '<li role="option" id="op' + i + '" data-e="' + x.e + '">' + esc(x.t) + "</li>").join("")
      : '<li class="vacio">Sin resultados. En esta prueba solo están España, las comunidades, las provincias y la provincia de Sevilla.</li>';
    lista.hidden = false;
    entrada.setAttribute("aria-expanded", "true");
    elegido = actuales.length ? 0 : -1;
    marcar();
  });
  entrada.addEventListener("keydown", (ev) => {
    if (lista.hidden) return;
    if (ev.key === "ArrowDown") { elegido = Math.min(elegido + 1, actuales.length - 1); marcar(); ev.preventDefault(); }
    else if (ev.key === "ArrowUp") { elegido = Math.max(elegido - 1, 0); marcar(); ev.preventDefault(); }
    else if (ev.key === "Enter" && elegido >= 0) { ir(actuales[elegido].e); ev.preventDefault(); }
    else if (ev.key === "Escape") cerrar();
  });
  lista.addEventListener("mousedown", (ev) => {
    const li = ev.target.closest("li[data-e]");
    if (li) { ev.preventDefault(); ir(li.dataset.e); }
  });
  entrada.addEventListener("blur", () => setTimeout(cerrar, 150));
}

// --- Direcciones -----------------------------------------------------------------------------------------

// Pide los mapas a la vez que la ficha, sin esperar a que la ficha diga cuáles son: los de las áreas que contiene el
// lugar y los de su zona (los de las áreas que contiene el área de arriba), según los mapas ya cargados, que dicen
// en mapas_hijos qué mapas tiene debajo cada una de sus áreas.
function adelantarMapa(nivel, codigo) {
  const pedir = (g) => cargar("mapas/" + g + ".json").catch(() => {});
  const arriba = { municipio: codigo.slice(0, 2), distrito: codigo.slice(0, 5), seccion: codigo.slice(0, 7) }[nivel];
  estado.metas.forEach((m) => {
    const h = m.mapas_hijos || {};
    (h[codigo] || []).forEach(pedir);
    if (arriba) (h[arriba] || []).forEach(pedir);
  });
}

// Las direcciones sin tema ni variable (migas, buscador) conservan los que se están viendo
function seguirRuta() {
  performance.clearMarks(); performance.clearMeasures(); performance.mark("ruta");
  const [camino, consulta] = location.hash.replace(/^#\/?/, "").split("?");
  const partes = camino.split("/");
  document.querySelectorAll(".enlaces-cabecera a").forEach((a) => {
    if (a.getAttribute("href") === "#/" + partes[0]) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
  });
  // «Fuentes» y «Sobre el proyecto», en la ventana, con la ficha detrás (la de España si se entra directamente)
  const ventana = { fuentes: verFuentes, proyecto: verProyecto }[partes[0]];
  if (ventana) {
    estado.deVentana = true;
    if (estado.ficha) estado.pasosVentana = (estado.pasosVentana || 0) + 1;
    return (estado.ficha ? Promise.resolve() : verFicha("nacional", "00")).then(ventana);
  }
  estado.pasosVentana = 0;
  if ($("ventana").open) $("ventana").close();
  // Al volver de la ventana a la ficha que estaba detrás, no hace falta pintarla otra vez
  if (estado.deVentana) {
    estado.deVentana = false;
    if (estado.ficha && location.hash === direccion(estado.ficha.nivel, estado.ficha.codigo)) { document.title = estado.tituloFicha; return; }
  }
  const q = new URLSearchParams(consulta || "");
  if (q.get("tema") && estado.temas.temas.some((t) => t.id === q.get("tema"))) estado.tema = q.get("tema");
  if (q.get("v")) estado.columna = q.get("v");
  const [nivel, codigo] = partes;
  if (NIVELES.indexOf(nivel) >= 0 && /^\d{2,10}$/.test(codigo || "")) {
    adelantarMapa(nivel, codigo);
    return verFicha(nivel, codigo);
  }
  return verFicha("nacional", "00");
}

async function iniciar() {
  estado.temas = await cargar("temas.json");
  iniciarMapa();
  iniciarBuscador();
  iniciarVentana();
  $("ir-ficha").addEventListener("click", (ev) => {
    ev.preventDefault();
    $("cabeza").scrollIntoView({ behavior: "smooth" });
    ev.currentTarget.hidden = true;
  });
  window.addEventListener("hashchange", seguirRuta);
  // Los gráficos se dibujan al ancho de la columna: si cambia, se vuelven a dibujar
  let ancho = anchoGrafico(), espera = null;
  window.addEventListener("resize", () => {
    clearTimeout(espera);
    espera = setTimeout(() => {
      if (estado.ficha && anchoGrafico() !== ancho) { ancho = anchoGrafico(); pintarFicha(); }
    }, 200);
  });
  seguirRuta();
}

iniciar();
