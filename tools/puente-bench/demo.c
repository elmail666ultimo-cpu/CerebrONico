#include <stdlib.h>
/*
 * demo.c — LA DEMO DEL PUENTE, EN C, PARA MEDIRLA DE VERDAD
 * ==========================================================
 * Esto es la traducción FIEL de la demo en Rust que se propuso, con su misma
 * estructura y sus mismos tiempos (1 ms local / 30 ms nube de conexión, 4 ms /
 * 20 ms de "streaming", cuatro fragmentos). Se compila y se ejecuta para poder
 * hablar con números en vez de con opiniones.
 *
 * Y luego, en la segunda mitad del archivo, la MISMA demo con la única diferencia
 * que importa: streaming de verdad, entregando cada fragmento por callback según
 * se produce.
 *
 * Compilar:  gcc -O2 -o demo demo.c
 */
#define _POSIX_C_SOURCE 200809L
#include <stdio.h>
#include <string.h>
#include <time.h>

static double ahora_ms(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec * 1000.0 + (double)ts.tv_nsec / 1e6;
}
static void dormir_ms(int ms) {
  struct timespec ts = { ms / 1000, (long)(ms % 1000) * 1000000L };
  nanosleep(&ts, NULL);
}

/* =====================================================================
 * PARTE A — LA DEMO TAL CUAL SE PROPUSO (fiel al Rust original)
 * =====================================================================
 * Nótese `unsigned char **out`: la función DEVUELVE un array con TODOS los
 * fragmentos ya construidos. Eso es una lista, no un stream.
 */
static int connect_local(void)  { dormir_ms(1);  return 0; }
static int connect_cloud(void)  { dormir_ms(30); return 0; }

static int stream_local(unsigned char **out) {
  static unsigned char a[] = "Cere", b[] = "broni", c[] = "co: ", d[] = "Local_OK";
  unsigned char *v[4] = { a, b, c, d };
  unsigned char **r = malloc(sizeof(v));
  if (!r) return -1;
  memcpy(r, v, sizeof(v));
  dormir_ms(4);            /* <- el sleep va ANTES de devolverlo todo */
  *out = (unsigned char *)r; /* se devuelve el array completo */
  return 4;
}

static int stream_cloud(unsigned char **out) {
  static unsigned char a[] = "Cere", b[] = "broni", c[] = "co: ", d[] = "Cloud_OK";
  unsigned char *v[4] = { a, b, c, d };
  unsigned char **r = malloc(sizeof(v));
  if (!r) return -1;
  memcpy(r, v, sizeof(v));
  dormir_ms(20);
  *out = (unsigned char *)r;
  return 4;
}

static void validar_como_se_propuso(int es_local, const char *nombre) {
  printf("\n--- Validando Operacionalmente: [%s] ---\n", nombre);
  double inicio_total = ahora_ms();

  double t_conn = ahora_ms();
  if (es_local) connect_local(); else connect_cloud();
  printf("[Metrica] Handshake / Conexion: %.2f ms\n", ahora_ms() - t_conn);

  double t_stream = ahora_ms();
  unsigned char *chunks = NULL;
  int n = es_local ? stream_local(&chunks) : stream_cloud(&chunks);
  unsigned char **arr = (unsigned char **)chunks;

  double ttft = 0.0;
  size_t bytes_totales = 0;
  for (int i = 0; i < n; i++) {
    if (i == 0) {
      ttft = ahora_ms() - t_stream;
      printf("[Metrica] Latencia al Primer Token (TTFT): %.2f ms\n", ttft);
    }
    bytes_totales += strlen((char *)arr[i]);
  }
  double total = ahora_ms() - inicio_total;
  printf("[Estado] Flujo completado. Total bytes: %zu\n", bytes_totales);
  printf("[Metrica] Ciclo total: %.2f ms\n", total);
  free(chunks);
}

/* =====================================================================
 * PARTE B — LA MISMA DEMO CON STREAMING DE VERDAD
 * =====================================================================
 * La única diferencia: se entrega cada fragmento AL PRODUCIRSE, por callback. El
 * consumidor recibe el primero antes de que exista el segundo, así que el TTFT
 * pasa a medir lo que cree que mide.
 */
typedef void (*consumidor_fn)(const unsigned char *chunk, size_t len, void *ctx);

static void productor(const char **frases, int n, int ms_por_trozo, consumidor_fn cb, void *ctx) {
  for (int i = 0; i < n; i++) {
    dormir_ms(ms_por_trozo);
    cb((const unsigned char *)frases[i], strlen(frases[i]), ctx);
  }
}

typedef struct { double t_inicio; double ttft; int vistos; size_t bytes; } contador;
static void contar(const unsigned char *c, size_t len, void *ctx) {
  (void)c;
  contador *k = (contador *)ctx;
  if (k->vistos == 0) k->ttft = ahora_ms() - k->t_inicio;
  k->vistos++;
  k->bytes += len;
}

static void validar_con_stream_real(int es_local, const char *nombre) {
  printf("\n--- Validando con STREAM REAL: [%s] ---\n", nombre);
  double inicio_total = ahora_ms();
  double t_conn = ahora_ms();
  if (es_local) connect_local(); else connect_cloud();
  printf("[Metrica] Handshake / Conexion: %.2f ms\n", ahora_ms() - t_conn);

  const char *frases[4] = { "Cere", "broni", "co: ", es_local ? "Local_OK" : "Cloud_OK" };
  contador k = { ahora_ms(), 0.0, 0, 0 };
  productor(frases, 4, es_local ? 4 : 20, contar, &k);

  printf("[Metrica] Latencia al Primer Token (TTFT): %.2f ms\n", k.ttft);
  printf("[Estado] Flujo completado. Total bytes: %zu\n", k.bytes);
  printf("[Metrica] Ciclo total: %.2f ms\n", ahora_ms() - inicio_total);
}

int main(void) {
  printf("============================================================\n");
  printf(" A) LA DEMO TAL CUAL SE PROPUSO (el sleep va antes de devolver)\n");
  printf("============================================================");
  validar_como_se_propuso(1, "MODO LOCAL (RAM/IPC)");
  validar_como_se_propuso(0, "MODO CLOUD (WebSocket)");

  printf("\n============================================================\n");
  printf(" B) LA MISMA DEMO CON STREAM REAL (callback por fragmento)\n");
  printf("============================================================");
  validar_con_stream_real(1, "MODO LOCAL (RAM/IPC)");
  validar_con_stream_real(0, "MODO CLOUD (WebSocket)");

  printf("\n============================================================\n");
  printf(" LECTURA DE LOS NUMEROS\n");
  printf("============================================================\n");
  printf("En (A), TTFT y Ciclo total salen practicamente IGUALES en cada modo:\n");
  printf("el primer token solo puede llegar cuando ya estan todos, porque la\n");
  printf("funcion devuelve la lista completa. El 'TTFT' que imprime no es una\n");
  printf("latencia de primer token: es la latencia del lote entero.\n");
  printf("En (B), con la misma logica pero entrega por fragmento, el TTFT mide\n");
  printf("de verdad el arranque y queda por debajo del ciclo total.\n");
  return 0;
}
