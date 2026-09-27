/**
 * espejosServidor.test.ts — GUARDIÁN DE LOS ESPEJOS DE SERVIDOR DE DATOS
 * ======================================================================
 * Verifica que la selección automática sea CONSISTENTE (determinista, sin
 * ids repetidos ni referencias rotas), EXTENSIBLE (el enrutador recorre el
 * catálogo completo) y SEGURA (entrada acotada, sin silencio ante datos
 * inválidos). Se ejecuta con:
 *
 *     npx tsx tests/espejosServidor.test.ts
 */

import {
  seleccionarExperto,
  ejecutarEspejoServidor,
  estadoEspejosServidor,
  espejosDeCategoria,
  IDS_ESPEJOS_SERVIDOR,
  LIMITE_CONSULTA,
  CATEGORIAS_SERVIDOR,
} from "../src/engine/reflejo/espejosServidor";

let fallos = 0;
function comprobar(nombre: string, condicion: boolean, extra = ""): void {
  if (condicion) {
    console.log(`  ✓ ${nombre}`);
  } else {
    fallos++;
    console.error(`  ✗ ${nombre}${extra ? ` — ${extra}` : ""}`);
  }
}

function main() {
  console.log("— CONSISTENCIA (catálogo) —");

  const estado = estadoEspejosServidor();
  comprobar("catálogo con 10 espejos", estado.totalEspejos === 10, `total=${estado.totalEspejos}`);
  comprobar("catálogo con 10 categorías", estado.totalCategorias === 10);

  comprobar("ids de espejo únicos", new Set(IDS_ESPEJOS_SERVIDOR).size === IDS_ESPEJOS_SERVIDOR.length);
  comprobar(
    "ids de categoría únicos",
    new Set(CATEGORIAS_SERVIDOR.map((c) => c.id)).size === CATEGORIAS_SERVIDOR.length
  );

  const idsCategoria = new Set(CATEGORIAS_SERVIDOR.map((c) => c.id));
  const categoriasValidas = estado.espejos.every((e) => idsCategoria.has(e.categoria));
  comprobar("cada espejo referencia una categoría existente", categoriasValidas);

  const senalesSanas = estado.espejos.every((e) =>
    e.senales.length > 0 && e.senales.every((s) => s === s.toLowerCase() && !/[áéíóúüñ]/i.test(s))
  );
  comprobar("señales no vacías, en minúsculas y sin acentos", senalesSanas);

  const porCategoriaOk =
    espejosDeCategoria("relacional").length === 1 &&
    espejosDeCategoria("realtime").length === 1 &&
    espejosDeCategoria("no-existe").length === 0;
  comprobar("agrupación por categoría (1 espejo por tipo)", porCategoriaOk);

  console.log("— SELECCIÓN AUTOMÁTICA —");

  const casos: Array<[string, string]> = [
    ["crea una tabla de usuarios con claves foráneas y transacciones", "servidor.relacional"],
    ["guarda documentos json en mongo con índices", "servidor.documental"],
    ["cache en redis con ttl y memoria", "servidor.clave_valor"],
    ["grafo de amigos en neo4j con nodos y aristas", "servidor.grafo"],
    ["embeddings y similitud coseno con pgvector", "servidor.vectorial"],
    ["métricas de telemetría IoT con retención", "servidor.serie_temporal"],
    ["cola de tareas con celery, workers y ack", "servidor.colas"],
    ["subir archivos a s3 o minio en un bucket", "servidor.objetos"],
    ["búsqueda full text en elasticsearch con relevancia", "servidor.busqueda"],
    ["websocket en tiempo real con streaming", "servidor.realtime"],
  ];

  for (const [consulta, esperado] of casos) {
    const r = seleccionarExperto(consulta);
    comprobar(
      `«${consulta.slice(0, 40)}…» → ${esperado}`,
      r.ok === true && r.mejor?.id === esperado,
      r.ok ? `ganó ${r.mejor?.id} (score ${r.mejor?.score})` : `motivo: ${r.motivo}`
    );
  }

  const a = seleccionarExperto("diseña una tabla sql de clientes");
  const b = seleccionarExperto("diseña una tabla sql de clientes");
  comprobar("determinista (misma consulta, misma selección)", a.mejor?.id === b.mejor?.id);

  const sin = seleccionarExperto("hola, ¿cómo estás?");
  comprobar("sin coincidencias → mejor null + motivo", sin.mejor === null && typeof sin.motivo === "string");

  console.log("— SEGURIDAD —");

  comprobar("rechaza consulta vacía", seleccionarExperto("   ").ok === false);
  comprobar("rechaza no-texto", seleccionarExperto(123).ok === false);
  comprobar(
    "rechaza consulta que supera el límite",
    seleccionarExperto("a".repeat(LIMITE_CONSULTA + 1)).ok === false
  );
  const raro = seleccionarExperto("\u0000<script>alert(1)</script> ' OR 1=1 --");
  comprobar("no revienta con entrada hostil", typeof raro.ok === "boolean");

  console.log("— CONTRATOS (ejecución determinista) —");

  const vec = ejecutarEspejoServidor("servidor.vectorial", { dimensiones: 384, registros: 1000 });
  comprobar(
    "vectorial: 384×1000×4 = 1,536,000 bytes",
    vec.ok === true && (vec.salida as any)?.bytesEstimados === 384 * 1000 * 4,
    JSON.stringify(vec.salida)
  );

  const rel = ejecutarEspejoServidor("servidor.relacional", {
    tablas: [
      { nombre: "usuarios", columnas: [{ nombre: "id", tipo: "INTEGER", pk: true }] },
      { nombre: "pedidos", columnas: [{ nombre: "usuario_id", tipo: "INTEGER", fk: { tabla: "usuarios", columna: "id" } }] },
    ],
  });
  comprobar(
    "relacional: genera DDL y detecta 1 clave foránea",
    rel.ok === true &&
      String((rel.salida as any)?.ddl).includes("CREATE TABLE") &&
      (rel.salida as any)?.clavesForaneas?.length === 1,
    JSON.stringify(rel.salida)
  );

  const inexistente = ejecutarEspejoServidor("servidor.inventado", {});
  comprobar("id desconocido → ok:false con motivo", inexistente.ok === false && typeof inexistente.motivo === "string");

  console.log(`\n${fallos === 0 ? "✓ TODO EN VERDE" : `✗ ${fallos} fallo(s)`}`);
  process.exit(fallos === 0 ? 0 : 1);
}

main();
