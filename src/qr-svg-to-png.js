import { PNG } from "pngjs";

/**
 * Convierte el SVG de un QR de Wompi (BANCOLOMBIA_QR) a un PNG pixel-perfecto.
 *
 * El SVG que entrega Wompi NO es una imagen rasterizada ni usa curvas: es una
 * cuadrícula matemática exacta donde cada módulo negro del QR es un cuadrado
 * de 1x1 unidad dibujado como `Mx,yh1v1h-1z` dentro de un único <path>, sobre
 * un `viewBox="0 0 N N"` (p. ej. 121x121). Ejemplo real:
 *
 *   <svg ... viewBox="0 0 121 121" ...>
 *     <rect width="100%" height="100%" fill="#FFFFFF"/>
 *     <path d="M0,0h1v1h-1z M1,0h1v1h-1z M2,0h1v1h-1z ..."/>
 *   </svg>
 *
 * En vez de rasterizar ese SVG con el motor de renderizado del navegador
 * (lo cual introduce antialiasing/suavizado en los bordes entre módulos —
 * sospechoso principal de que cámaras reales no puedan leer el QR exportado,
 * aunque librerías de software como jsQR sí toleren ese ruido), parseamos el
 * `<path>` directamente y pintamos cada módulo como un bloque de píxeles
 * sólido, sin ninguna interpolación. Esto es exactamente lo que hace una
 * librería de generación de QR "de verdad" — el resultado es indistinguible
 * de un QR nativo.
 *
 * @param {string} svgString - Contenido del SVG (ya decodificado de base64)
 * @param {object} [opts]
 * @param {number} [opts.moduleSize=10] - Píxeles por cada módulo del QR
 * @param {number} [opts.quietZoneModules=4] - Módulos de margen blanco por lado
 *   (el estándar QR exige mínimo 4; el SVG de Wompi no incluye esta zona)
 * @returns {Buffer} PNG codificado, listo para enviar o guardar
 */
export function svgQrToPngBuffer(svgString, { moduleSize = 10, quietZoneModules = 4 } = {}) {
  const viewBoxMatch = svgString.match(/viewBox="0 0 (\d+) (\d+)"/);
  if (!viewBoxMatch) {
    throw new Error("No se pudo leer el viewBox del SVG del QR (formato inesperado).");
  }
  const gridSize = parseInt(viewBoxMatch[1], 10);

  const blackModules = [];
  const moduleRegex = /M(\d+),(\d+)h1v1h-1z/g;
  let match;
  while ((match = moduleRegex.exec(svgString)) !== null) {
    blackModules.push([parseInt(match[1], 10), parseInt(match[2], 10)]);
  }

  if (blackModules.length === 0) {
    throw new Error("No se encontraron módulos negros en el SVG del QR (formato inesperado).");
  }

  const totalModules = gridSize + quietZoneModules * 2;
  const pixelSize = totalModules * moduleSize;

  const png = new PNG({ width: pixelSize, height: pixelSize });

  // Fondo blanco opaco en todo el lienzo.
  for (let i = 0; i < png.data.length; i += 4) {
    png.data[i] = 255;
    png.data[i + 1] = 255;
    png.data[i + 2] = 255;
    png.data[i + 3] = 255;
  }

  function paintPixel(px, py) {
    const idx = (pixelSize * py + px) << 2;
    png.data[idx] = 0;
    png.data[idx + 1] = 0;
    png.data[idx + 2] = 0;
    png.data[idx + 3] = 255;
  }

  for (const [mx, my] of blackModules) {
    const startX = (mx + quietZoneModules) * moduleSize;
    const startY = (my + quietZoneModules) * moduleSize;
    for (let dy = 0; dy < moduleSize; dy++) {
      for (let dx = 0; dx < moduleSize; dx++) {
        paintPixel(startX + dx, startY + dy);
      }
    }
  }

  return PNG.sync.write(png);
}
