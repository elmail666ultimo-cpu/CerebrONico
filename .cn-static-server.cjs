
const http = require("http");
const fs = require("fs");
const p = require("path");
const root = p.resolve(process.argv[2] || ".");
const port = Number(process.argv[3] || 3500);
const TYPES = {
  ".html": "text/html; charset=utf-8", ".htm": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp",
  ".ico": "image/x-icon", ".woff": "font/woff", ".woff2": "font/woff2",
  ".ttf": "font/ttf", ".mp4": "video/mp4", ".txt": "text/plain; charset=utf-8"
};
// ================================================================
// v8.0.4 — POR QUÉ ESTO YA NO PUEDE QUEDARSE EN BLANCO
// ----------------------------------------------------------------
// Antes: si no había index.html en la raíz servida, TODA petición caía en un
// 404 de texto plano. En pantalla eso se ve como una página en blanco sin una
// sola pista, que es literalmente lo reportado: «el chat contestó la petición
// del chat web pero el previsualizador quedó blanco».
//
// Y había un caso real detrás, no teórico: si el modelo escribe en una carpeta
// DISTINTA de la que sirve el sandbox (se han visto proyectos/ y .proyectos/ en
// el mismo equipo), el preview no refleja nada nunca y desde fuera es
// indistinguible de «está roto». El servidor no tenía forma de contarlo.
//
// Ahora se explica, en tres capas:
//   1. Si no hay index.html en la raíz pero hay UN solo subdirectorio con
//      index.html, se sirve ESE. Muchas veces esto arregla el preview y punto.
//   2. Si no aparece por ningún lado, sirve una página de DIAGNÓSTICO en HTML
//      (no un texto plano de 404) con la raíz real, lo que hay dentro y dónde
//      ha visto algún index.html.
//   3. Si el index.html existe pero pesa 0 bytes, lo dice: una escritura a
//      medias produce exactamente una página blanca.
// ================================================================
function entradasDe(dir) {
  try { return fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return []; }
}
function esIndex(dir) {
  try { return fs.statSync(p.join(dir, "index.html")).isFile(); } catch (e) { return false; }
}
// Sin caché a propósito: el modelo escribe archivos MIENTRAS esto corre, y una
// raíz cacheada dejaría de ver lo que acaba de llegar justo cuando hace falta.
function raizEfectiva() {
  if (esIndex(root)) return { dir: root, motivo: "index.html en la raiz servida" };
  const candidatos = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) candidatos.push(e.name);
  }
  if (candidatos.length === 1) {
    return { dir: p.join(root, candidatos[0]), motivo: "index.html en el subdirectorio " + candidatos[0] + "/" };
  }
  return { dir: root, motivo: candidatos.length > 1 ? "varios subdirectorios con index.html: " + candidatos.join(", ") : "no hay ningun index.html" };
}
function paginaDiagnostico(urlPath, raiz) {
  const nombres = [];
  for (const e of entradasDe(root)) nombres.push(e.name + (e.isDirectory() ? "/" : ""));
  const indices = [];
  for (const e of entradasDe(root)) {
    if (!e.isDirectory()) continue;
    if (e.name === "node_modules" || e.name === ".git") continue;
    if (esIndex(p.join(root, e.name))) indices.push(e.name + "/index.html");
  }
  const h = [];
  h.push("<!DOCTYPE html><html lang="es"><head><meta charset="utf-8">");
  h.push("<title>Sandbox :3500 - no hay nada que servir</title>");
  h.push("<style>body{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;background:#0b0f14;color:#dbe3ec;padding:28px;line-height:1.6;font-size:13px}");
  h.push("h1{font-size:16px;color:#f0b429;margin:0 0 14px}code{background:#111820;padding:1px 5px;border-radius:4px;color:#7dd3fc}");
  h.push("ul{margin:6px 0 0;padding-left:18px}.k{color:#9aa7b5}hr{border:0;border-top:1px solid #1e2733;margin:18px 0}</style></head><body>");
  h.push("<h1>El sandbox de :3500 responde, pero no hay ningun index.html que servir</h1>");
  h.push("<p>Esto <b>no</b> es un fallo de red ni una pagina en blanco sin motivo: el servidor esta vivo y te esta diciendo lo que ve.</p>");
  h.push("<p><span class="k">Raiz servida:</span> <code>" + root + "</code><br>");
  h.push("<span class="k">Ruta pedida:</span> <code>" + urlPath + "</code><br>");
  h.push("<span class="k">Motivo:</span> " + raiz.motivo + "</p><hr>");
  h.push("<p><span class="k">Lo que hay en esa raiz:</span></p><ul>");
  h.push(nombres.length ? nombres.map(function (n) { return "<li>" + n + "</li>"; }).join("") : "<li>(carpeta vacia o ilegible)</li>");
  h.push("</ul>");
  if (indices.length) {
    h.push("<hr><p><span class="k">index.html encontrados en subcarpetas:</span></p><ul>");
    h.push(indices.map(function (n) { return "<li>" + n + "</li>"; }).join(""));
    h.push("</ul><p>Si el que quieres previsualizar es uno de esos, el IDE deberia servir esa carpeta como raiz del sandbox.</p>");
  }
  h.push("<hr><p><span class="k">Que hacer:</span><br>1. Comprueba que el modelo escribio en <code>" + root + "</code> y no en otra carpeta.<br>");
  h.push("2. Si escribio en una subcarpeta, arrastra ese index.html a la raiz o vuelve a arrancar el sandbox apuntando ahi.<br>");
  h.push("3. Este panel se genera en cada peticion: recarga para ver el estado actual.</p>");
  h.push("</body></html>");
  return h.join("");
}
const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/__cn_info") {
    const raiz = raizEfectiva();
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify({ ok: true, raizPedida: root, raizEfectiva: raiz.dir, motivo: raiz.motivo, tieneIndex: esIndex(raiz.dir) }));
    return;
  }
  const raiz = raizEfectiva();
  if (urlPath.endsWith("/")) urlPath += "index.html";
  const target = p.resolve(p.join(raiz.dir, urlPath));
  if (!target.startsWith(raiz.dir)) { res.writeHead(403); res.end("403"); return; }
  fs.readFile(target, (err, data) => {
    if (err) {
      // Fallback de SPA: cualquier ruta desconocida sirve index.html
      fs.readFile(p.join(raiz.dir, "index.html"), (e2, d2) => {
        if (e2) {
          // Se busca index.html en la raíz original antes de rendirse, porque la
          // ausencia del pedido no implica la ausencia del sitio.
          const html = paginaDiagnostico(urlPath, raiz);
          res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        if (!d2 || d2.length === 0) {
          const html = paginaDiagnostico(urlPath, raiz).replace(
            "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
            "index.html existe pero esta VACIO (0 bytes)"
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        // ============================================================
        // v8.0.8 — 🐞 UN index.html QUE NO ES HTML (la causa REAL del blanco)
        // ------------------------------------------------------------
         // Este caso no es teórico: está en el propio ZIP del usuario. Su
         // .proyectos/index.html pesa 24 bytes y contiene, literalmente:
        //
        //     // test sync 1789242976
        //
         // Es un COMENTARIO DE JAVASCRIPT. El servidor lo manda con
         // Content-Type text/html, el navegador lo parsea como HTML, no
        // encuentra ni una etiqueta, y pinta una página en blanco. Sin error, sin
        // aviso en la consola, sin nada. Es la explicación exacta del
        // «previsualizador quedó blanco» que se ha reportado media docena de
        // veces, y demuestra por qué la comprobación de 0 bytes no bastaba:
        // 24 bytes de basura se ve EXACTAMENTE igual que una página rota.
        //
        // Se comprueba que el contenido tenga pinta de HTML antes de servirlo.
        // Si no la tiene, se dice qué hay en su lugar.
        // ============================================================
        const texto2 = d2.toString("utf8");
        // Las barras invertidas van DOBLES: esto vive dentro de una plantilla de
        // TypeScript, y una sola barra la consumiria TypeScript antes de que el
        // codigo generado la viera. Un \s suelto se convierte en una "s" y el
        // regex deja de filtrar sin que nada avise.
        const pareceHtml = /<\s*(!doctype|\?xml|html|head|body|div|span|p|section|main|header|footer|nav|ul|ol|h[1-6]|a|img|script|style|link|meta|form|button)\b/i.test(texto2);
        if (!pareceHtml) {
          const muestra = texto2.trim().slice(0, 300).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
          const html = paginaDiagnostico(urlPath, raiz).replace(
            "El sandbox de :3500 responde, pero no hay ningun index.html que servir",
            "index.html existe pero NO contiene HTML (por eso se ve en blanco)"
          ).replace(
            "</body></html>",
            "<hr><p><span class="k">Contenido real del archivo (" + d2.length + " bytes):</span></p>" +
            "<pre style="background:#111820;padding:10px;border-radius:6px;white-space:pre-wrap;color:#f0b429">" +
            muestra + (texto2.length > 300 ? "
..." : "") + "</pre>" +
            "<p>Un archivo que no contiene etiquetas HTML se renderiza como pagina vacia. Suele ser el residuo de una prueba de sincronizacion o una escritura a medias.</p>" +
            "</body></html>"
          );
          res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
          res.end(html);
          return;
        }
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        res.end(d2);
      });
      return;
    }
    res.writeHead(200, {
      "Content-Type": TYPES[p.extname(target).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});
server.listen(port, "127.0.0.1", () => console.log("CerebroNico static server en http://127.0.0.1:" + port + " (raiz: " + root + ")"));
