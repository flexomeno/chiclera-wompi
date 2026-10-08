import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "..", "data");
const COUNTER_FILE = path.join(DATA_DIR, "counter.json");
const CODES_FILE = path.join(DATA_DIR, "codes.json");
const CONTACTS_FILE = path.join(DATA_DIR, "contacts.json");

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readJson(file, fallback) {
  if (!existsSync(file)) return fallback;
  try {
    return JSON.parse(readFileSync(file, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

/**
 * Almacenamiento simple basado en archivos JSON (suficiente para un solo
 * proceso de baja concurrencia, como este servidor de webhook de prueba).
 *
 * - counter.json:  contador global del HOTP (se incrementa en cada código nuevo generado).
 * - codes.json:    registro de códigos generados, indexados por ID de transacción
 *                   (sirve también para idempotencia: evita generar 2 códigos si
 *                   Wompi reintenta el mismo webhook).
 * - contacts.json: teléfono (WhatsApp) ingresado por el cliente AL CREAR la
 *                   transacción (antes de que exista el webhook). Wompi solo
 *                   nos devuelve el email en el evento, nunca el teléfono —
 *                   por eso lo guardamos nosotros mismos de antemano, para
 *                   poder enviar el código por WhatsApp cuando llegue el pago.
 */
export class Store {
  constructor() {
    ensureDataDir();
    this.counterState = readJson(COUNTER_FILE, { counter: -1 });
    this.codesState = readJson(CODES_FILE, {});
    this.contactsState = readJson(CONTACTS_FILE, {});
  }

  /** Incrementa y persiste el contador global, devolviendo el nuevo valor. */
  incrementCounter() {
    this.counterState.counter += 1;
    writeJson(COUNTER_FILE, this.counterState);
    return this.counterState.counter;
  }

  hasCodeForTransaction(transactionId) {
    return Boolean(this.codesState[transactionId]);
  }

  getCodeByTransaction(transactionId) {
    return this.codesState[transactionId];
  }

  saveCode(record) {
    this.codesState[record.transactionId] = record;
    writeJson(CODES_FILE, this.codesState);
    return record;
  }

  /** Guarda el teléfono (y email) del cliente al momento de crear la transacción. */
  saveContact(transactionId, { email, phone }) {
    this.contactsState[transactionId] = { email, phone };
    writeJson(CONTACTS_FILE, this.contactsState);
  }

  getContact(transactionId) {
    return this.contactsState[transactionId];
  }
}
