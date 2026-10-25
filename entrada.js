// Página de entrada (portada): se ve solo con la dirección principal, sin nada detrás de «#». Los enlaces a un lugar,
// el buscador y «Vivienda en España» de la cabecera («#/») van directamente a las fichas. Se carga sin «defer», justo
// después de la portada, para que no se vea la ficha un momento antes de taparla.
(function () {
  const portada = document.getElementById("portada");
  function ver() {
    const enPortada = location.hash.replace(/^#/, "") === "";
    portada.hidden = !enPortada;
    document.documentElement.classList.toggle("con-portada", enPortada);
  }
  window.addEventListener("hashchange", ver);
  ver();
})();
