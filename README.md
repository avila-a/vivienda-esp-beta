# Vivienda en España

Datos de vivienda de cada lugar de España, de la comunidad autónoma a la sección censal: viviendas turísticas, alquiler, viviendas vacías o poco usadas y construcción.

Página: https://avila-a.github.io/vivienda-esp-beta

## Qué hay en este repositorio

- La página: `index.html`, `app.js`, `graficos.js`, `csv.js`, `entrada.js`, `estilo.css`, `entrada.css` y `lib/` (Leaflet, para el mapa; GoatCounter, el contador de visitas sin cookies; y la imagen que se ve al compartir un enlace).
- `.github/workflows/publicar.yml`: el proceso que publica la página en GitHub Pages.
- Esta explicación y la licencia (`LICENSE`).

Los datos de la página (la carpeta `datos/`: fichas, mapas y descargas) no están en el repositorio. Van en un zip adjunto a cada *Release*, y el proceso de publicación lo une a la página. Se preparan y se comprueban aparte, antes de cada publicación: cada cifra de la página se compara con las tablas de las que sale.

Para ver la página en tu ordenador: baja el zip de la última Release, descomprímelo en la carpeta del repositorio (se crea `datos/`) y sirve la carpeta con cualquier servidor web local. Abrir `index.html` directamente no funciona: el navegador no deja leer `datos/` desde un archivo.

## Fuentes

Cada bloque de la página dice su fuente y su fecha, y la página «Fuentes» las reúne todas. En resumen:

- INE: Censo de Población y Viviendas 2021 (también la clasificación de las viviendas según su consumo eléctrico), estadística experimental de viviendas turísticas, Padrón, Encuesta Anual de Estructura Salarial, IPC, Indicadores Urbanos (precio de venta y sus zonas) y contornos de las secciones censales.
- Eurostat: grado de urbanización de los municipios.
- Ministerio de Vivienda y Agenda Urbana: viviendas terminadas, sistema de referencia del precio del alquiler y compraventas.
- Dirección General del Catastro: viviendas por año de construcción.
- Consejo General del Notariado: compraventas y precio de la vivienda comprada por extranjeros.
- elDiario.es: recuento de anuncios de alquiler de idealista (no es una fuente oficial; solo se enseña, no va en las descargas).
- Inside Airbnb: anuncios de Airbnb en nueve áreas de España (no es una fuente oficial ni está asociada a Airbnb; solo se enseña, no va en las descargas).
- Natural Earth: países vecinos en los mapas de España, solo para dibujar.

Elaboración propia con datos extraídos del sitio web del INE: www.ine.es. Ninguna de las fuentes participa en esta página ni la respalda.

## Licencia

Resumen (el texto completo está en `LICENSE`):

- Datos, textos y gráficos: [CC BY-NC-ND 4.0](https://creativecommons.org/licenses/by-nc-nd/4.0/deed.es). Se pueden compartir tal cual, citando la página, sin fines comerciales y sin modificarlos.
- Código de la página: todos los derechos reservados.
- Leaflet: BSD de dos cláusulas. Fondo del mapa: © colaboradores de OpenStreetMap.
- Los datos originales de cada fuente siguen con su propia licencia.

## Cómo citar

Antonio Avila-Uribe, *Vivienda en España*, https://avila-a.github.io/vivienda-esp-beta, consultado el [fecha].
