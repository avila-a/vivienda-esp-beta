// Descarga de los datos de un lugar: una fila por cifra, con su valor tal como está en la tabla del nivel,
// sus avisos, su fuente y su fecha. Va en un archivo aparte para poder probarla fuera de la página
// (revisar.R la ejecuta con Node).
"use strict";

function filasDescarga(ficha, col) {
  const columnas = col.columnas;
  const filas = [["columna", "titulo", "valor", "avisos", "fuente", "fecha"]];
  const info = (c) => columnas[c] || {};
  for (const [c, v] of Object.entries(ficha.area)) {
    filas.push([c, info(c).titulo || c, v == null ? "" : v, "", info(c).fuente || "", ""]);
  }
  for (const b of ficha.bloques) {
    if (b.id === "anuncios") continue;   // fuente no oficial, sin permiso para redistribuirla
    for (const x of b.cifras) {
      if (x.rango) continue;   // rango de las áreas que contiene: cifra propia de la página, no va en la descarga
      const avisos = x.avisos.map((i) => ficha.avisos[i]).join("; ");
      filas.push([x.columna, info(x.columna).titulo || x.columna, x.valor == null ? "" : x.valor, avisos,
                  info(x.columna).fuente || "", info(x.columna).fecha || ""]);
    }
  }
  return filas;
}

function aCsv(filas) {
  const celda = (v) => {
    const s = String(v);
    return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return "﻿" + filas.map((f) => f.map(celda).join(",")).join("\r\n") + "\r\n";
}

if (typeof module !== "undefined") module.exports = { filasDescarga, aCsv };
