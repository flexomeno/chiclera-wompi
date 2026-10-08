# ADR 12: Sin reserved concurrency en Lambda (cuota de cuenta nueva)

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

El diseño inicial reservaba 25 + 50 + 10 ejecuciones. Cuentas AWS nuevas tienen cuota total **10** y exigen dejar **10 unreserved**. El apply falló con `InvalidParameterValueException`.

## Decisión

No se reserva concurrencia. El techo de abuso/costo lo pone el **throttle del HTTP API** (50 rps / burst 100). Si AWS sube la cuota, se puede volver a reservar sin cambiar el modelo.

## Consecuencias

- **Bien:** el stack aplica en cuentas nuevas; 500 ventas/día caben de sobra en 10 concurrentes.
- **Mal:** un pico extremo comparte el pool de 10 con las tres funciones. Irrelevante al volumen actual.
