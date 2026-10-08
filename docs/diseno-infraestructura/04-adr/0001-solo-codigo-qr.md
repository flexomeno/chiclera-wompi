# ADR 01: Solo Código QR (`BANCOLOMBIA_QR`)

- Estado: Aceptado
- Fecha: 2026-10

## Contexto

Wompi ofrece varios métodos. El Código QR tiene comisión especial del **1 %**. El resto del plan avanzado (tarjetas, etc.) cobra **2.65 % + $700 + IVA**, inviable para micropagos. En el prototipo se llegó a ofrecer Transfer y Nequi push (misma comisión 1 % en tarifas publicadas) y un selector en móvil, porque el QR en la misma pantalla del celular no se puede escanear con la cámara.

Se resolvió el QR-en-el-mismo-teléfono con descarga PNG + “escanear desde imagen” en Nequi, verificado en dispositivo real.

## Decisión

El backend **solo crea y solo honra** transacciones `BANCOLOMBIA_QR`. El webhook ignora cualquier otro `payment_method_type`. No hay Widget con catálogo completo de métodos.

## Consecuencias

- **Bien:** comisión predecible; el cliente no puede pagar por un medio que no genera código.
- **Mal:** quien no pueda usar QR Bancolombia/Nequi no paga. Transfer/Nequi push quedan documentados como experimento revertido, no como deuda a reabrir sin un ADR nuevo.
