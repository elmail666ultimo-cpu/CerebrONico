# Banco del puente

`demo.c` es la demo de Rust propuesta, TRADUCIDA FIELMENTE a C y ejecutada, para
poder medirla. No hay `rustc` en el entorno de desarrollo, pero si `gcc`.

Compilar y ejecutar:

    gcc -O2 -o demo demo.c && ./demo

La parte (A) reproduce la demo tal cual se propuso: `stream_response` devuelve un
array con TODOS los fragmentos y el `sleep` va antes de devolverlo. Por eso el
TTFT que imprime sale igual al tiempo del lote entero: no mide el arranque.

La parte (B) es la misma logica entregando cada fragmento al producirse. Mismo
lenguaje, mismos tiempos; lo unico que cambia es cuando sale cada trozo. El TTFT
no cambia de valor, pero el ciclo total pasa a ser mayor que el TTFT — y esa es la
firma de un stream de verdad.

Conclusion completa, con los numeros, en `PUENTE_LENGUAJE_Y_MEDICION.md`.

## Los tres transportes, medidos

`medir_transportes.py` y `medir_mmap_bien.py` comparan el coste de ida y vuelta de
TCP loopback, socket de dominio Unix y memoria compartida, en el mismo equipo.

    python3 medir_transportes.py    # primera version: el mmap sale MAL, y se explica por que
    python3 medir_mmap_bien.py      # medicion corregida, con eventfd en vez de bucle de espera

Resultado corregido (p50, 3000 repeticiones, mensaje de 51 bytes):

    TCP loopback                  45.08 us
    Socket Unix                   16.42 us   <- el mas rapido, y sin cambiar de lenguaje
    Memoria compartida (eventfd)  31.89 us

La primera medicion daba 5.130 us para memoria compartida: era un artefacto del
instrumento (bucle de espera que no suelta el GIL), no una propiedad del mmap. El
script lleva la explicacion dentro a proposito, porque el error es instructivo:
**la memoria compartida no es gratis ni automaticamente rapida; necesita
disciplina de sincronizacion.**
