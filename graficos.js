// Gráficos de un lugar, en el sitio del mapa: botón «Gráficos de <lugar>» (25 de octubre de 2026). Solo aparece si
// el lugar tiene gráficos en la pestaña abierta (datos/graficos.json, que escribe graficos_contexto.R). Como en el
// resto de la página, no calcula ninguna cifra: las cifras y sus textos vienen ya hechos; aquí solo se dibujan.
// Usa cargar, esc, numero, direccion, encuadrar, estado y los colores de app.js.
"use strict";

const vistas = { vista: "mapa", lista: [], clave: null, elegido: null };   // elegido: id del gráfico a la vista
// El nombre del lugar sin su nivel («Provincia: Sevilla» -> «Sevilla»; decisión del usuario, 25 de octubre de 2026): el
// resto de la página ya dice qué es
const nombreLugar = (f) => f.titulo.replace(/^[^:]+:\s*/, "");

async function pintarGraficosLugar(f, tema) {
  const indice = await cargar("graficos.json").catch(() => ({ graficos: [] }));
  // Gráficos de unos lugares (`lugares`) o de todos los de unos niveles (`niveles`: en qué pestañas sale en cada uno);
  // con `partes`, el lugar solo lo tiene si está en su archivo
  const candidatos = indice.graficos.filter((g) => g.niveles ? (g.niveles[f.nivel] || []).indexOf(tema.id) >= 0
    : g.temas.indexOf(tema.id) >= 0 && g.lugares.some((l) => l.nivel === f.nivel && l.codigo === f.codigo));
  const tiene = await Promise.all(candidatos.map((g) => g.partes ? datosDeLugar(g, f) : true));
  if (estado.ficha !== f || temaActual() !== tema) return;   // ya se ha cambiado de lugar o de pestaña
  vistas.lista = candidatos.filter((g, i) => tiene[i]);
  vistas.ficha = f;
  const div = $("vistas");
  if (!vistas.lista.length) {
    div.hidden = true;
    mostrarVista("mapa");
    return;
  }
  div.hidden = false;
  // Un solo botón, al lado de los de mapa (decisión del usuario, 25 de octubre de 2026): se marca y se desmarca; los
  // de mapa también vuelven al mapa (abajo, al final del archivo)
  div.innerHTML = '<button type="button" data-vista="graficos" aria-pressed="' + (vistas.vista === "graficos") + '">' + esc("Gráficos de " + nombreLugar(f)) + "</button>";
  div.querySelector("button").addEventListener("click", () => {
    mostrarVista(vistas.vista === "graficos" ? "mapa" : "graficos");
    // Con los gráficos, la columna ya no se queda fija (estilo.css): si su principio quedó por encima o bajo la
    // cabecera, se sube a él
    const zona = document.querySelector(".zona-mapa");
    if (vistas.vista === "graficos" && zona.getBoundingClientRect().top < parseFloat(getComputedStyle(zona).scrollMarginTop)) zona.scrollIntoView({ block: "start" });
  });
  vistas.clave = null;   // los gráficos se vuelven a dibujar: puede haber cambiado el ancho
  mostrarVista(vistas.vista);
  pintarEnlacesFicha(f);
}

function mostrarVista(v) {
  const antes = vistas.vista;
  vistas.vista = v;
  const conGraficos = v === "graficos" && vistas.lista.length > 0;
  document.querySelector(".zona-mapa").classList.toggle("con-graficos", conGraficos);
  $("graficos-lugar").hidden = !conGraficos;
  $("vistas").querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(conGraficos)));
  if (conGraficos) return dibujarGraficosLugar();
  // De vuelta al mapa: Leaflet mira otra vez su tamaño y, si se encuadró mientras estaba oculto, se encuadra ahora
  if (antes === "graficos" && estado.mapa) {
    estado.mapa.invalidateSize({ pan: false });
    if (estado.encuadrarPendiente && estado.capa) { estado.encuadrarPendiente = false; encuadrar(true); }
  }
}

// Un gráfico cada vez (pedido por el usuario, 26 de octubre de 2026; antes, todos seguidos): si el lugar tiene más de
// uno, un selector «Gráfico:» como el de «Medida:» de la ficha. El elegido se conserva al cambiar de lugar o de
// pestaña si el nuevo también lo tiene; si no, el primero.
async function dibujarGraficosLugar() {
  const zona = $("graficos-lugar");
  const g = vistas.lista.find((x) => x.id === vistas.elegido) || vistas.lista[0];
  vistas.elegido = g.id;
  const clave = vistas.lista.map((x) => x.id).join(",") + "|" + g.id + "|" + zona.clientWidth;
  if (vistas.clave === clave) return;
  vistas.clave = clave;
  try {
    const d = await datosDeLugar(g, vistas.ficha);
    if (vistas.clave !== clave) return;
    const mayus = (t) => t.charAt(0).toUpperCase() + t.slice(1);
    const selector = vistas.lista.length < 2 ? "" : '<div class="bases" role="radiogroup" aria-label="Gráfico"><span class="bases-titulo">Gráfico:</span>' +
      vistas.lista.map((x) => '<button type="button" role="radio" data-grafico="' + esc(x.id) + '" aria-checked="' + (x === g) + '">' +
        esc(mayus(x.corto || x.enlace)) + "</button>").join("") + "</div>";
    zona.innerHTML = selector + (d.tipo ? htmlGraficoConsumo(d) : htmlGraficoGrupos(d));
    if (d.tipo) conectarInfo(zona, d); else conectarGraficoGrupos(zona, d);
    zona.querySelectorAll("[data-grafico]").forEach((b) => b.addEventListener("click", () => verGrafico(b.dataset.grafico)));
  } catch (e) {
    zona.innerHTML = '<p class="error">No se ha podido cargar el gráfico.</p>';
  }
}

function verGrafico(id) {
  vistas.elegido = id;
  if (vistas.vista === "graficos") dibujarGraficosLugar(); else mostrarVista("graficos");
}

// Los datos de un gráfico para un lugar. Con `partes` (muchos lugares), graficos/<id>/<parte>.json: uno por nivel y,
// en municipios y distritos, uno por provincia; los textos comunes van una vez (`comun`). Sin el lugar, null. Sin
// `partes`, el archivo de cada lugar va en `lugares` (España, comunidades y provincias)
const parteDe = (f) => (f.nivel === "municipio" || f.nivel === "distrito" ? f.nivel + "_" + f.codigo.slice(0, 2) : f.nivel);
async function datosDeLugar(g, f) {
  if (!g.partes) {
    const l = g.lugares.find((x) => x.nivel === f.nivel && x.codigo === f.codigo);
    return cargar("graficos/" + (l && l.archivo ? l.archivo : g.id + ".json"));
  }
  const p = await cargar("graficos/" + g.id + "/" + parteDe(f) + ".json").catch(() => null);
  const l = p && p.lugares[f.codigo];
  return l ? Object.assign({ id: g.id, titulo: g.titulo, colores: p.comun.colores }, p.comun[l.tipo], l) : null;
}

// --- Viviendas por consumo de luz (3r, con las vacías aparte): una barra horizontal por tramo -----------------------
// tipo «recuento» (de España al municipio): % de todas las viviendas y número; «estimacion» (distrito): % de las
// viviendas en uso, sin número

function htmlGraficoConsumo(d) {
  const W = Math.max(300, Math.min(760, $("graficos-lugar").clientWidth || 600));
  const recuento = d.tipo === "recuento";
  const filas = recuento ? d.filas.map((x, i) => ({ nombre: x.nombre, grupo: x.grupo, p: d.v[i][0], n: d.v[i][1] })) : d.filas;
  const textoDe = (x) => numero(x.p, 1) + "%" + (recuento ? " · " + numero(x.n, 0) : "");
  const izq = Math.min(W < 480 ? 110 : 150, Math.max(...filas.map((x) => anchoTexto(x.nombre))) + 6);
  const der = Math.max(...filas.map((x) => anchoTexto(textoDe(x)))) + 4;
  const max = Math.max(...filas.map((x) => x.p));
  const paso = pasoEje(max), tope = Math.max(paso, Math.ceil(max / paso) * paso);
  const sx = (v) => (v / tope) * (W - izq - der);
  let y = 4, s = "";
  filas.forEach((x, i) => {
    const lineas = partirTexto(x.nombre, izq - 6), alto = Math.max(20, lineas.length * 13 + 6);
    lineas.forEach((l, k) => {
      s += '<text x="' + (izq - 6) + '" y="' + (y + alto / 2 + 4 - (lineas.length - 1) * 6.5 + k * 13) + '" text-anchor="end" font-size="12" fill="' + TINTA + '">' + esc(l) + "</text>";
    });
    const w = sx(x.p), yb = y + (alto - 14) / 2;
    s += '<rect x="' + izq + '" y="' + yb + '" width="' + Math.max(w, 0.5).toFixed(2) + '" height="14" fill="' + d.colores[x.grupo] + '"><title>' +
      esc(x.nombre + ": " + textoDe(x)) + "</title></rect>" +
      '<text x="' + (izq + w + 4) + '" y="' + (yb + 11) + '" font-size="11" fill="' + TINTA + '">' + esc(textoDe(x)) + "</text>";
    y += alto + (recuento && i === 0 ? 10 : 0);   // las vacías, aparte
  });
  let rejilla = "";
  for (let v = 0; v <= tope + 1e-9; v += paso) {
    const x = izq + sx(v);
    rejilla += '<line x1="' + x + '" x2="' + x + '" y1="0" y2="' + y + '" stroke="' + REJILLA + '"/>' +
      '<text x="' + x + '" y="' + (y + 12) + '" text-anchor="middle" font-size="11" fill="' + TINTA_SUAVE + '">' + numero(v, 0) + "%</text>";
  }
  y += 18;
  const svg = '<svg class="consumo-svg" data-id="' + esc(d.id) + '" viewBox="0 0 ' + W + " " + y + '" width="' + W + '" height="' + y +
    '" role="img" aria-label="' + esc(d.titulo) + '">' + rejilla + s + "</svg>";
  const leyenda = '<p class="leyenda-series">' + d.leyenda.map((x) => '<span><span class="muestra" style="background:' + d.colores[x.grupo] + '"></span>' + esc(x.nombre) + "</span>").join("") + "</p>";
  const subtitulo = d.subtitulo + (recuento ? " Todas las viviendas: " + numero(d.viviendas, 0) + "." : "");
  const tabla = tablaHtml(["Consumo de luz en 2020"].concat(recuento ? ["Viviendas", "% de todas las viviendas"] : ["% de las viviendas en uso"]),
    filas.map((x) => [esc(x.nombre)].concat(recuento ? [numero(x.n, 0), numero(x.p, 1) + "%"] : [numero(x.p, 1) + "%"])));
  const pie = '<details class="notas-grafico"><summary>Notas y fuente</summary><ul class="notas">' +
    (d.notas_lugar || []).map((t) => "<li>" + esc(t) + "</li>").join("") +
    d.notas.map((n) => "<li>" + esc(n.texto) + htmlEnlaceInfo(n.info) + "</li>").join("") + "<li>Fuente: " + esc(d.fuente) + ".</li></ul></details>";
  return htmlGrafico(d.titulo, svg, tabla, [], null, '<p class="subtitulo">' + esc(subtitulo) + "</p>" + leyenda, pie);
}

function conectarInfo(zona, d) {
  const svg = zona.querySelector('.consumo-svg[data-id="' + d.id + '"]');
  if (svg) svg.closest(".grafico").querySelectorAll("[data-info]").forEach((b) => b.addEventListener("click", () => INFO[b.dataset.info].ir()));
}

// --- Barras de 3u: el lugar (España, la comunidad o la provincia) arriba, con su eje; debajo, los grupos ---------
// de municipios, con otro eje común. Cada barra está hecha de trozos (los grupos arriba, los municipios en cada
// grupo), de mayor a menor.

const ALTO_BARRA = 20, HUECO_BARRAS = 4, ALTO_NOMBRE = 20, HUECO_PANEL = 14, ESPACIO_ETIQUETA = 135;

function htmlGraficoGrupos(d) {
  const W = Math.max(300, Math.min(760, $("graficos-lugar").clientWidth || 600));
  const m = { izq: 4, der: ESPACIO_ETIQUETA };
  const colorDe = (s) => d.series.find((x) => x.id === s).color;
  let y = 0, s = "";
  // Un panel: su nombre encima de cada grupo y sus dos barras; la escala es la del panel. `arriba`: el del lugar
  // (España, la comunidad o la provincia), apilado por grupos
  const panel = (titulo, grupos, nombreDe, arriba) => {
    const max = Math.max(...grupos.flatMap((g) => g.barras.map((b) => b.valor)));
    const paso = pasoEje(max), tope = Math.max(paso, Math.ceil(max / paso) * paso);
    const sx = (v) => (v / tope) * (W - m.izq - m.der);

    s += '<text x="' + m.izq + '" y="' + (y + 14) + '" font-size="13" font-weight="600" fill="' + TINTA + '">' + esc(titulo) + "</text>";
    y += ALTO_NOMBRE + 4;
    const yRejilla = y;
    let barras = "";
    grupos.forEach((g, ig) => {
      // El nombre del grupo, en las líneas que hagan falta para que quepa en el ancho del gráfico (en el móvil, varias)
      partirTexto(nombreDe(g), W - m.izq).forEach((l) => {
        barras += '<text x="' + m.izq + '" y="' + (y + 13) + '" font-size="12" fill="' + TINTA_SUAVE + '">' + esc(l) + "</text>";
        y += 15;
      });
      y += 3;
      g.barras.forEach((b, ib) => {
        let x = m.izq;
        b.trozos.forEach((t, it) => {
          const w = sx(t.v);
          barras += '<rect class="trozo" x="' + x.toFixed(2) + '" y="' + y + '" width="' + Math.max(w > 2 ? w - 0.6 : w, 0.01).toFixed(2) + '" height="' + ALTO_BARRA +
            '" fill="' + colorDe(b.serie) + '" data-t="' + [arriba ? -1 : ig, ib, it].join(",") + '"><title>' + esc(textoTrozo(d, b, t, arriba)) + "</title></rect>";
          x += w;
        });
        barras += '<text x="' + (m.izq + sx(b.valor) + 5) + '" y="' + (y + 8) + '" font-size="11" fill="' + TINTA + '">' +
          '<tspan x="' + (m.izq + sx(b.valor) + 5) + '">' + esc(b.texto[0]) + '</tspan><tspan x="' + (m.izq + sx(b.valor) + 5) + '" dy="11">' + esc(b.texto[1]) + "</tspan></text>";
        y += ALTO_BARRA + HUECO_BARRAS;
      });
      y += 4;
    });
    // Rejilla y eje del panel, debajo de las barras
    let rejilla = "";
    for (let v = 0; v <= tope + 1e-9; v += paso) {
      const x = m.izq + sx(v);
      rejilla += '<line x1="' + x + '" x2="' + x + '" y1="' + yRejilla + '" y2="' + y + '" stroke="' + REJILLA + '"/>' +
        '<text x="' + x + '" y="' + (y + 12) + '" text-anchor="' + (v === 0 ? "start" : "middle") + '" font-size="11" fill="' + TINTA_SUAVE + '">' + numero(v, 0) + "</text>";
    }
    s += rejilla + barras;
    y += 16 + HUECO_PANEL;

  };
  panel(d.total.nombre, [d.total], () => "Todas las viviendas: " + d.total.texto_viviendas, true);
  panel("Grupos de municipios (mismo eje)", d.grupos, (g) => g.nombre + " (" + g.texto_municipios + " municipios; " + g.texto_viviendas + " viviendas)", false);
  const svg = '<svg class="grupos-svg" data-id="' + esc(d.id) + '" viewBox="0 0 ' + W + " " + y + '" width="' + W + '" height="' + y +
    '" role="img" aria-label="' + esc(d.titulo) + '">' + s + "</svg>";
  const leyenda = '<p class="leyenda-series">' + d.series.map((x) => '<span><span class="muestra" style="background:' + x.color + '"></span>' + esc(x.nombre) + "</span>").join("") + "</p>";
  const tabla = tablaHtml(["Grupo", "Municipios", "Viviendas"].concat(d.series.map((x) => x.nombre)),
    [d.total].concat(d.grupos).map((g) => [esc(g.nombre), esc(g.texto_municipios || ""), esc(g.texto_viviendas)]
      .concat(g.barras.map((b) => esc(b.texto[0]) + "<br>" + esc(b.texto[1])))));
  const pie = '<p class="info-trozo" aria-live="polite">Pasa por encima de una barra o tócala para ver cada trozo.</p>' +
    '<details class="notas-grafico"><summary>Notas y fuente</summary><ul class="notas">' + d.notas.map((n) => "<li>" + esc(n.texto) + htmlEnlaceInfo(n.info) + "</li>").join("") +
    "<li>Fuente: " + esc(d.fuente) + ".</li></ul></details>";
  return htmlGrafico(d.titulo, svg, tabla, [], null, '<p class="subtitulo">' + esc(d.subtitulo) + "</p>" + leyenda, pie);
}

// Parte un texto de 12 px en líneas de, como mucho, `ancho` px (anchoTexto, de app.js)
function partirTexto(texto, ancho) {
  const lineas = [];
  for (const p of texto.split(" ")) {
    const ultima = lineas[lineas.length - 1];
    if (ultima !== undefined && anchoTexto(ultima + " " + p) <= ancho) lineas[lineas.length - 1] = ultima + " " + p;
    else lineas.push(p);
  }
  return lineas;
}

function textoTrozo(d, b, t, deArriba) {
  const unidad = d.series.find((x) => x.id === b.serie).unidad;
  return t.n + ": " + numero(t.v, 0) + " viviendas " + unidad + " (" + numero(t.p, 1) + "% de las viviendas " + (deArriba ? "del grupo" : t.c ? "del municipio" : "de esos municipios") + ")";
}

// --- Enlaces ------------------------------------------------------------------------------------------------------

// En la ficha, bajo su primer gráfico: una tarjeta pequeña por cada gráfico del lugar, que lo abre junto al mapa
const ICONO_BARRAS = '<svg class="icono-barras" viewBox="0 0 20 16" aria-hidden="true"><rect x="0" y="1" width="18" height="3"/>' +
  '<rect x="0" y="6.5" width="12" height="3"/><rect x="0" y="12" width="7" height="3"/></svg>';
function pintarEnlacesFicha(f) {
  const ficha = $("ficha");
  const p = document.createElement("div");
  p.className = "enlaces-graficos";
  p.innerHTML = vistas.lista.map((g) => '<button type="button" class="tarjeta-grafico" data-ver-graficos="' + esc(g.id) + '">' + ICONO_BARRAS +
    // En negrita, el título corto del gráfico (`corto`); debajo, el largo (`enlace`). Sin título corto, solo el largo
    '<span class="texto"><strong>' + esc("Ver gráfico de " + (g.corto || g.enlace)) + "</strong>" + (g.corto ? "<span>" + esc(g.enlace) + "</span>" : "") + "</span>" +
    '<span class="flecha" aria-hidden="true">→</span></button>').join("");
  const primero = ficha.querySelector(".grafico");
  if (primero) primero.after(p); else ficha.prepend(p);
  // Cada tarjeta abre su gráfico
  p.querySelectorAll("[data-ver-graficos]").forEach((b) => b.addEventListener("click", () => {
    verGrafico(b.dataset.verGraficos);
    document.querySelector(".zona-mapa").scrollIntoView({ behavior: "smooth", block: "start" });
  }));
}

// En las notas, «Más información sobre las viviendas …», como en la ficha: abre ese apartado de su pestaña
const INFO = {
  vacias: { texto: "Más información sobre las viviendas vacías", ir: () => irAInfoVacias() },
  turisticas: { texto: "Más información sobre las viviendas turísticas", ir: () => irAInfoTuristicas() },
};
function htmlEnlaceInfo(info) {
  if (!INFO[info] || (info === "turisticas" && !estado.temas.info_turisticas)) return "";
  return ' <button type="button" class="boton-enlace" data-info="' + info + '">' + ICONO_INFO + esc(INFO[info].texto) + "</button>";
}
// Como irAInfoVacias (app.js), para el apartado de las turísticas
function irAInfoTuristicas() {
  estado.tema = "turisticas";
  estado.columna = null;
  ajustarVariable();
  actualizarDireccion();
  pintarPestanas();
  estado.infoTuristicas = true;
  pintarFicha();
  verMapaDeFicha(estado.ficha, false);
  $("info-turisticas").scrollIntoView({ behavior: "smooth", block: "start" });
}

function conectarGraficoGrupos(zona, d) {
  const svg = zona.querySelector('.grupos-svg[data-id="' + d.id + '"]');
  if (!svg) return;
  const seccion = svg.closest(".grafico"), info = seccion.querySelector(".info-trozo");
  seccion.querySelectorAll("[data-info]").forEach((b) => b.addEventListener("click", () => INFO[b.dataset.info].ir()));
  let marcado = null;
  const elegir = (r) => {
    if (marcado) marcado.classList.remove("marcado");
    marcado = r;
    r.classList.add("marcado");
    const [ig, ib, it] = r.dataset.t.split(",").map(Number);
    const g = ig < 0 ? d.total : d.grupos[ig], b = g.barras[ib], t = b.trozos[it];
    info.innerHTML = esc(textoTrozo(d, b, t, ig < 0)) + (t.c ? ' <a href="' + direccion("municipio", t.c) + '">Ver su ficha</a>' : "");
  };
  svg.querySelectorAll("rect.trozo").forEach((r) => {
    r.addEventListener("mouseenter", () => elegir(r));
    r.addEventListener("click", () => elegir(r));
  });
}

// Con los gráficos a la vista, pulsar un botón de mapa (Provincias, Municipios…) vuelve al mapa. El botón hace lo
// suyo antes (cambiar de mapa); aquí, en el contenedor, solo se enseña el mapa
$("capas").addEventListener("click", (ev) => {
  if (ev.target.closest("button") && vistas.vista === "graficos") mostrarVista("mapa");
});
