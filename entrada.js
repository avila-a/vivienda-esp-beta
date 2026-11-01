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
  // «Empezar» es un enlace real para que Google llegue a los lugares (indexacion.md); un clic normal sigue sin recargar
  portada.querySelector("a[data-ruta]").addEventListener("click", (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return;
    ev.preventDefault();
    ev.stopPropagation();   // app.js, si ya está cargado, haría lo mismo
    location.hash = ev.currentTarget.dataset.ruta;
  });
  ver();
})();
