// Prueba del dashboard: la página. No calcula ninguna cifra: enseña los textos que escribe
// preparar_datos.R (cada cifra ya con su formato y sus avisos), y dibuja el mapa y los gráficos.
// Pestañas por tema (temas.json); en cada una, una variable elegida colorea el mapa y tiene el primer gráfico.
// Cada lugar tiene su dirección: #/<nivel>/<código>?tema=<tema>&v=<columna> (#/municipio/41091?tema=alquiler).
// La entrada es España.
"use strict";

const DATOS = "datos/";
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
const ORDEN_CAPAS = ["provincias", "municipios", "distritos", "secciones"];
const NOMBRE_CAPA = { distritos: "Distritos", secciones: "Secciones censales", municipios: "Municipios", provincias: "Provincias" };
const SIN_DATO = "#d6d6d6";
// Color de cada tema, el de colores_proyecto (0_funciones.R): para la barra del lugar en las comparaciones
const COLOR_TEMA = [[/^turistic/, "#e87ba4"], [/^(alquil|anuncio)/, "#eb6834"], [/^no_principales/, "#eda100"],
  [/^(vacia|menos_de|uno_a)/, "#6250d6"], [/^(construid|anios_)/, "#3a3a38"]];
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
  capaElegida: {}, desdeMapa: false, infoVacias: false,
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
const htmlEnlaceVacias = () => '<p class="enlace-vacias"><button type="button" class="boton-enlace" data-ir-vacias>' + ICONO_INFO + 'Más información sobre las viviendas vacías</button></p>';
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
}

// El área de la ficha, o las áreas que contiene si es una comunidad, un municipio o un distrito (los mapas de
// distritos y de secciones son de toda la provincia, o de una parte de ella)
function esElegida(p) {
  const f = estado.ficha;
  if (!f) return false;
  if (p.codigo === f.codigo) return true;
  if (f.nivel === "municipio") return p.mun === f.codigo;
  return (f.nivel === "ccaa" || f.nivel === "distrito") && p.padre === f.codigo;
}

// Posición (desde 1) de la variable elegida en el mapa cargado; 0 si el mapa no la tiene
const indiceVariable = () => estado.meta ? estado.meta.variables.findIndex((v) => v.columna === estado.columna) + 1 : 0;

function estilo(feature) {
  const p = feature.properties;
  const j = indiceVariable();
  const v = j ? estado.meta.variables[j - 1] : null;
  const clase = v ? p["c" + j] : 0;
  const conAviso = v && p["a" + j];
  const elegida = esElegida(p);
  return {
    fillColor: clase > 0 ? v.clases[clase - 1].color : SIN_DATO,
    fillOpacity: estado.meta.canarias_desplazada ? 0.95 : 0.8,
    color: elegida ? "#000" : conAviso ? "#222" : "#fff",
    weight: elegida ? 3 : conAviso ? 1.5 : 0.6,
    dashArray: conAviso && !elegida ? "4 3" : null,
  };
}

function textoTooltip(p) {
  const j = indiceVariable();
  const v = j ? estado.meta.variables[j - 1] : null;
  let h = "<strong>" + esc(p.titulo) + "</strong>";
  if (v) h += "<br>" + esc(v.titulo) + ": " + esc(p["x" + j]);
  if (v && p["a" + j]) h += '<br><span class="marca-aviso">⚠ ' + esc(p["a" + j]) + "</span>";
  return h;
}

async function verGrupo(grupo, encuadrarSiempre) {
  const datos = await cargar("mapas/" + grupo + ".json");
  estado.metas.set(grupo, datos.meta);
  const nuevo = estado.grupo !== grupo;
  if (nuevo) {
    if (estado.capa) estado.capa.remove();
    if (estado.cajaCanarias) { estado.cajaCanarias.remove(); estado.cajaCanarias = null; }
    estado.grupo = grupo;
    estado.meta = datos.meta;
    estado.porCodigo.clear();
    // Sin fondo en el mapa de provincias: Canarias va desplazada y no coincidiría con las calles
    if (datos.meta.canarias_desplazada) estado.fondo.remove();
    else estado.fondo.addTo(estado.mapa);
    estado.capa = L.geoJSON(datos, {
      style: estilo,
      onEachFeature: (f, capa) => {
        estado.porCodigo.set(f.properties.codigo, capa);
        capa.bindTooltip(() => textoTooltip(f.properties), { sticky: true });
        capa.on("click", () => {
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
  estado.capa.setStyle(estilo);
  if (nuevo || encuadrarSiempre) encuadrar(nuevo);
  pintarLeyenda();
  performance.mark("mapa");   // marcas para medir.R: cuánto se tarda en cada cambio de lugar
}

function encuadrar(nuevo) {
  const elegidas = [];
  estado.porCodigo.forEach((capa) => { if (esElegida(capa.feature.properties)) elegidas.push(capa); });
  elegidas.forEach((c) => c.bringToFront());
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
    else motivo = "«" + v.nombre + "» no está en el mapa de " + esc(m.titulo.toLowerCase()) + ".";
    $("leyenda").innerHTML = "<h3>" + esc(m.titulo) + "</h3><p>" + esc(motivo) + "</p>";
    return;
  }
  const v = m.variables[j - 1];
  let hayAviso = false;
  estado.porCodigo.forEach((capa) => { if (capa.feature.properties["a" + j]) hayAviso = true; });
  let h = "<h3>" + esc(m.titulo) + ": " + esc(v.titulo) + "</h3><ul>";
  h += v.clases.map((c) => '<li><span class="muestra" style="background:' + c.color + '"></span>' +
    esc(c.rotulo) + " (" + c.n + ")</li>").join("");
  if (v.sin_dato) h += '<li><span class="muestra" style="background:' + SIN_DATO + '"></span>sin dato (' + v.sin_dato + ")</li>";
  if (hayAviso) h += '<li><span class="muestra discontinua"></span>borde discontinuo: la cifra tiene aviso</li>';
  h += "</ul>";
  h += "<p>Entre paréntesis, cuántas áreas hay en cada clase.</p>";
  if (v.paleta === "variacion") h += "<p>Las subidas, de blanco (sin subida) a rojo oscuro: cuanto más sube, más cálido. Las bajadas, aparte, en azul claro.</p>";
  if (v.paleta === "calida") h += "<p>Cuanto más caro, más cálido.</p>";
  h += "<p>Datos: " + esc([v.fuente, v.fecha].filter(Boolean).join(", ")) + ".</p>";
  if (DE_ELDIARIO.test(v.columna)) h += htmlCita();
  if (f && m.sin_contorno.indexOf(f.codigo) >= 0) {
    h += '<p class="marca-aviso">' + esc(f.titulo) + " no está en el mapa: no tiene contorno en el Censo 2021.</p>";
  }
  $("leyenda").innerHTML = h;
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
  const tiene = (g) => (f.mapa.variables[g] || []).some((i) => estado.temas.variables_mapa[i] === estado.columna);
  const con = candidatos.filter(tiene);
  const elegida = estado.capaElegida[f.codigo];
  const grupo = elegida && con.indexOf(elegida) >= 0 ? elegida : con[0] || (elegida && candidatos.indexOf(elegida) >= 0 ? elegida : candidatos[0]);
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

// Una destacada con `antes` se lee «<antes> <cifra> <etiqueta>» y va bajo la anterior, en su misma casilla
function htmlDestacada(f, d) {
  let h = '<div class="destacada' + (d.antes ? " junto" : "") + '" data-columna="' + d.columna + '">' +
    (d.antes ? '<div class="etiqueta">' + esc(d.antes) + "</div>" : "") + '<div class="numero">' + esc(d.texto) + "</div>" +
    '<div class="etiqueta">' + esc(d.etiqueta) + "</div>" + (d.fecha ? '<div class="fecha">' + esc(d.fecha) + "</div>" : "");
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

// Tarjeta de una variable del tema: la cifra del lugar, qué es, la fecha y sus avisos. La elegida, grande.
function htmlTarjeta(f, v, elegida) {
  const x = estado.cifras.get(v.columna);
  const c = estado.col.columnas[v.columna] || {};
  const avisos = x ? x.avisos : [];
  let h = (elegida ? '<div class="tarjeta elegida"' : '<button type="button" class="tarjeta" data-elegir="' + v.columna + '"') +
    ' data-columna="' + v.columna + '"><span class="numero">' + esc(x ? x.texto : "sin dato") + "</span>" +
    '<span class="etiqueta">' + esc(c.titulo || v.nombre) + "</span>" + (c.fecha ? '<span class="fecha">' + esc(conPeriodo(c.fecha, [f.periodo_construccion])) + "</span>" : "");
  if (elegida && avisos.length) h += '<span class="aviso"><ul>' + avisos.map((i) => "<li>⚠ " + esc(f.avisos[i]) + "</li>").join("") + "</ul></span>";
  else if (avisos.length) h += marcas(f, avisos);
  if (elegida && c.que_es) h += '<span class="que-es-tarjeta">' + esc(c.que_es) + "</span>";
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
      "</dt><dd>" + esc(x.texto) + " " + marcas(f, x.avisos) + "</dd>" +
      (c.que_es ? '<dd class="que-es" hidden>' + esc(c.que_es) + (c.calculo && /dashboard/.test(c.calculo) ? " " + esc(c.calculo) : "") +
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

// El lugar frente a las áreas que lo contienen y España
function htmlComparar(f, columna) {
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
  const notas = ["Barras: este lugar (en color) y las áreas que lo contienen, hasta España (en gris). Cada área, con la cifra de su tabla; sus avisos, en su ficha."];
  const fecha = conPeriodo(c.fecha, f.contexto.areas.map((a) => a.periodo));
  const cita = DE_ELDIARIO.test(columna) ? htmlCita() : "";
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
  filas.push({ etiqueta: "Precios (IPC de España)", valor: s.ipc.variacion, texto: s.ipc.texto, color: "#8a8880" });
  const titulo = "Subida de " + s.anio_inicio + " a " + s.anio_fin + ": alquiler, salario y precios";
  const cifra = (c) => { const x = estado.cifras.get(c); return x ? esc(x.texto) : "sin dato"; };
  const tabla = tablaHtml(["", String(s.anio_inicio), String(s.anio_fin), "Subida"], [
    ["Alquiler mediano al mes (pisos)", cifra("alquiler_mes_mediana_2015"), cifra("alquiler_mes_mediana_2024"), mes ? esc(mes.texto) : "sin dato"],
    ["Alquiler mediano por m² (pisos)", cifra("alquiler_m2_mediana_2015"), cifra("alquiler_m2_mediana_2024"), m2 ? esc(m2.texto) : "sin dato"],
    ["Salario mediano bruto al año (" + esc(s.ambito) + ")", esc(s.salario.texto_inicio), esc(s.salario.texto_fin), esc(s.salario.texto)],
    ["Índice de precios de consumo (media anual)", numero(s.ipc.inicio, 1), numero(s.ipc.fin, 1), esc(s.ipc.texto)]]);
  const notas = [];
  if (!conAlquiler) notas.push("Este lugar no tiene la subida del alquiler (ver los avisos): solo se ven el salario y los precios.");
  notas.push("Euros de cada año, sin descontar la inflación: por eso va al lado la subida de los precios.",
    "Salario: mediana de la ganancia bruta anual por trabajador de " + s.ambito + " (la mitad de los trabajadores gana menos y la otra mitad, más). " + s.salario.fuente + ".",
    "Precios: " + s.ipc.fuente + ".",
    "El alquiler es la mediana de los alquileres de pisos en vigor declarados a Hacienda (Ministerio de Vivienda): lo que pagan quienes ya tienen contrato, no el precio de los contratos nuevos. No es un índice de precios y la base crece de un año a otro.");
  if (s.nota) notas.push(s.nota);
  return htmlGrafico(titulo, svgBarras(filas, titulo), tabla, notas, null);
}

// Viviendas construidas por año: columnas, con la media que se usa en la ficha marcada
function htmlConstruccion(s) {
  if (!s) return htmlGrafico("Viviendas construidas por año", '<p class="sin-grafico">Sin datos de construcción para esta área.</p>', null, [], null);
  const W = anchoGrafico(), H = estrecha() ? 230 : 260, m = { izq: 56, der: 12, arr: 34, abj: 30 };
  const x0 = s.anios[0], x1 = s.anios[s.anios.length - 1];
  const ancho = (W - m.izq - m.der) / (x1 - x0 + 1);
  const sx = (a) => m.izq + (a - x0 + 0.5) * ancho;
  const media = estado.cifras.get("construidas_al_anio"), periodo = estado.cifras.get("construidas_periodo");
  const { g: base, sy } = marco(W, H, m, Math.max(1, ...s.valores, media && media.valor ? media.valor : 0),
    (y) => y.toLocaleString("es-ES"), x0, x1, sx, W < 480 ? 10 : 5);
  let g = base;
  const color = s.tipo === "ministerio" ? "#3a3a38" : "#a8a6a0";
  s.anios.forEach((a, i) => {
    const y = sy(s.valores[i]);
    g += '<rect x="' + (sx(a) - ancho * 0.4) + '" y="' + y + '" width="' + ancho * 0.8 + '" height="' + Math.max(H - m.abj - y, 0) + '" rx="1.5" fill="' + color + '"><title>' + a + ": " + esc(s.textos[i]) + " viviendas</title></rect>";
  });
  const anios = periodo && /(\d{4})\D+(\d{4})/.exec(periodo.texto);
  if (media && media.valor != null && anios) {
    const a0 = +anios[1], a1 = +anios[2], y = sy(media.valor);
    g += '<line x1="' + (sx(a0) - ancho / 2) + '" x2="' + (sx(a1) + ancho / 2) + '" y1="' + y + '" y2="' + y + '" stroke="' + colorTema("anios_") + '" stroke-width="2"/>' +
      '<text x="' + (sx(a1) + ancho / 2) + '" y="' + (y - 6) + '" text-anchor="end" font-size="12" font-weight="600" fill="' + TINTA + '">media ' + a0 + "–" + a1 + ": " + esc(media.texto) + "</text>";
  }
  const svg = '<svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(s.titulo) + '">' + g + "</svg>";
  const tabla = tablaHtml(["Año", "Viviendas"], s.anios.map((a, i) => [a, esc(s.textos[i])]));
  return htmlGrafico(s.titulo, svg, tabla, s.notas.concat(media && anios ? ["La línea es la media que usa la ficha para los años de construcción y el ritmo por cada mil viviendas."] : []), s.fuente);
}

function htmlGraficoVariable(f, v) {
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
    case "comparar": return htmlComparar(f, v.columna);
    default: return "";
  }
}

// --- Ficha -----------------------------------------------------------------------------------------------

function htmlDescargas(f) {
  return '<section class="descargas"><h2>Descargar</h2>' +
    '<button type="button" id="descargar-lugar">Datos de este lugar (CSV)</button>' +
    '<a class="boton secundario" href="' + f.descarga.tabla_nivel + '" download>Todas las áreas de este nivel (CSV)</a>' +
    "<p>Las cifras van sin redondear, como en las tablas del proyecto, y cada una con sus avisos. " +
    '<a href="datos/descargas/descripcion_datos_' + f.nivel + '.txt">Qué es cada columna</a>.' +
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
  if (!v) {
    h += '<p class="sin-tema">Este tema no tiene cifras para ' + NOMBRE_NIVEL[f.nivel] + ".</p>";
  } else {
    h += htmlTarjeta(f, v, true);
    h += htmlGraficoVariable(f, v);
    if (tema.id === "vacias" && hayVacias()) h += htmlInfoVacias(estado.infoVacias);
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
  $("cabeza").innerHTML = '<p class="migas"><a href="#/">España</a></p><h1>Fuentes y fechas</h1>';
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
  $("ficha").innerHTML = h;
  document.title = "Fuentes · Vivienda en España";
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
  if (partes[0] === "fuentes") { $("pestanas").innerHTML = ""; return verFuentes(); }
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
      if (estado.ficha && !location.hash.startsWith("#/fuentes") && anchoGrafico() !== ancho) { ancho = anchoGrafico(); pintarFicha(); }
    }, 200);
  });
  seguirRuta();
}

iniciar();
