const CONFIG = Object.freeze({
  USERS_SHEET: "Usuarios",
  SESSIONS_SHEET: "Sesiones",
  AUDIT_SHEET: "Auditoria",
  MAX_STAMPS: 10,
  SESSION_HOURS: 12,
  HASH_ROUNDS: 8000,
  CODE_ALPHABET: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
});

const USER_HEADERS = ["id", "nombre", "correo", "passwordHash", "salt", "codigo", "sellos", "rol", "creadoEn"];
const SESSION_HEADERS = ["tokenHash", "userId", "venceEn", "creadoEn"];
const AUDIT_HEADERS = ["fecha", "encargadoId", "clienteId", "codigo", "sellosAnteriores", "sellosNuevos"];

function doGet() {
  return json_({ ok: true, data: { service: "FESTEC SJ 2026", status: "online" } });
}

function doPost(e) {
  try {
    const contents = (e && e.postData && e.postData.contents) || "{}";
    if (contents.length > 10000) throw new Error("Solicitud demasiado grande.");
    const request = JSON.parse(contents);
    const routes = {
      register: () => register_(request),
      login: () => login_(request),
      logout: () => logout_(request),
      me: () => me_(request),
      getClient: () => getClient_(request),
      addStamp: () => addStamp_(request)
    };
    if (!routes[request.action]) throw new Error("Acción no válida.");
    return json_({ ok: true, data: routes[request.action]() });
  } catch (error) {
    return json_({ ok: false, error: error.message || "Error interno." });
  }
}

/** Ejecuta esta función una vez después de definir SPREADSHEET_ID. */
function setup() {
  const spreadsheet = getSpreadsheet_();
  ensureSheet_(spreadsheet, CONFIG.USERS_SHEET, USER_HEADERS);
  ensureSheet_(spreadsheet, CONFIG.SESSIONS_SHEET, SESSION_HEADERS);
  ensureSheet_(spreadsheet, CONFIG.AUDIT_SHEET, AUDIT_HEADERS);
  const properties = PropertiesService.getScriptProperties();
  if (!properties.getProperty("PASSWORD_PEPPER")) {
    properties.setProperty("PASSWORD_PEPPER", randomToken_() + randomToken_());
  }
  const email = properties.getProperty("ADMIN_EMAIL");
  const password = properties.getProperty("ADMIN_PASSWORD");
  if (email && password) {
    if (!findUserByEmail_(email)) {
      validatePassword_(password);
      createUser_("Encargado FESTEC", email, password, "encargado");
    }
    properties.deleteProperty("ADMIN_PASSWORD");
  }
}

function register_(request) {
  const name = cleanName_(request.name);
  const email = cleanEmail_(request.email);
  validatePassword_(request.password);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (findUserByEmail_(email)) throw new Error("Ya existe una cuenta con ese correo.");
    const user = createUser_(name, email, request.password, "cliente");
    return createSession_(user);
  } finally { lock.releaseLock(); }
}

function login_(request) {
  const email = cleanEmail_(request.email);
  if (typeof request.password !== "string" || request.password.length > 128) {
    throw new Error("Correo o contraseña incorrectos.");
  }
  const user = findUserByEmail_(email);
  if (!user || !constantTimeEqual_(user.passwordHash, hashPassword_(String(request.password || ""), user.salt))) {
    throw new Error("Correo o contraseña incorrectos.");
  }
  return createSession_(user);
}

function logout_(request) {
  if (!request.token) return { loggedOut: true };
  const tokenHash = hashToken_(String(request.token));
  const sheet = getSheet_(CONFIG.SESSIONS_SHEET);
  const rows = sheetObjects_(CONFIG.SESSIONS_SHEET)
    .filter((session) => constantTimeEqual_(String(session.tokenHash), tokenHash))
    .map((session) => session.row)
    .sort((a, b) => b - a);
  rows.forEach((row) => sheet.deleteRow(row));
  return { loggedOut: true };
}

function me_(request) {
  const user = requireSession_(request.token);
  return publicUser_(user);
}

function getClient_(request) {
  requireStaff_(request.token);
  const client = findUserByCode_(cleanCode_(request.code));
  if (!client || client.role !== "cliente") throw new Error("No se encontró ese cliente.");
  return publicUser_(client);
}

function addStamp_(request) {
  const staff = requireStaff_(request.token);
  const code = cleanCode_(request.code);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const client = findUserByCode_(code);
    if (!client || client.role !== "cliente") throw new Error("No se encontró ese cliente.");
    const previous = client.stamps;
    if (previous >= CONFIG.MAX_STAMPS) throw new Error("La tarjeta ya está completa.");
    const next = previous + 1;
    getSheet_(CONFIG.USERS_SHEET).getRange(client.row, 7).setValue(next);
    getSheet_(CONFIG.AUDIT_SHEET).appendRow([new Date(), staff.id, client.id, client.code, previous, next]);
    return { code: client.code, stamps: next };
  } finally { lock.releaseLock(); }
}

function createUser_(name, email, password, role) {
  const salt = randomToken_();
  const code = role === "cliente" ? generateUniqueCode_() : "";
  const id = Utilities.getUuid();
  getSheet_(CONFIG.USERS_SHEET).appendRow([id, name, cleanEmail_(email), hashPassword_(password, salt), salt, code, 0, role, new Date()]);
  return { id: id, name: name, email: cleanEmail_(email), code: code, stamps: 0, role: role };
}

function createSession_(user) {
  cleanupSessions_();
  const token = randomToken_() + randomToken_();
  const expires = new Date(Date.now() + CONFIG.SESSION_HOURS * 60 * 60 * 1000);
  getSheet_(CONFIG.SESSIONS_SHEET).appendRow([hashToken_(token), user.id, expires, new Date()]);
  return { token: token, role: user.role, expiresAt: expires.toISOString() };
}

function requireSession_(token) {
  if (!token) throw new Error("Sesión no válida.");
  const rows = sheetObjects_(CONFIG.SESSIONS_SHEET);
  const tokenHash = hashToken_(String(token));
  const session = rows.find((row) => constantTimeEqual_(String(row.tokenHash), tokenHash));
  if (!session || new Date(session.venceEn).getTime() <= Date.now()) throw new Error("Tu sesión venció. Ingresa de nuevo.");
  const user = findUserById_(String(session.userId));
  if (!user) throw new Error("Sesión no válida.");
  return user;
}

function requireStaff_(token) {
  const user = requireSession_(token);
  if (user.role !== "encargado") throw new Error("Esta acción requiere una cuenta de encargado.");
  return user;
}

function findUserByEmail_(email) { return userObjects_().find((user) => user.email === cleanEmail_(email)); }
function findUserByCode_(code) { return userObjects_().find((user) => user.code === code); }
function findUserById_(id) { return userObjects_().find((user) => user.id === id); }

function publicUser_(user) {
  return { id: user.id, name: user.name, email: user.email, code: user.code, stamps: user.stamps, role: user.role };
}

function userObjects_() {
  return sheetObjects_(CONFIG.USERS_SHEET).map((row) => ({
    row: row.row,
    id: String(row.id),
    name: String(row.nombre || "").trim(),
    email: String(row.correo || "").trim().toLowerCase(),
    passwordHash: String(row.passwordHash || ""),
    salt: String(row.salt || ""),
    code: String(row.codigo || "").trim().toUpperCase(),
    stamps: normalizeStamps_(row.sellos),
    role: String(row.rol || "").trim().toLowerCase(),
    createdAt: row.creadoEn
  }));
}

function sheetObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];
  const headers = values[0];
  return values.slice(1).filter((row) => row.some((cell) => cell !== "")).map((row, index) => {
    const object = { row: index + 2 };
    headers.forEach((header, column) => { object[header] = row[column]; });
    return object;
  });
}

function generateUniqueCode_() {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    let suffix = "";
    for (let index = 0; index < 8; index += 1) suffix += CONFIG.CODE_ALPHABET.charAt(Math.floor(Math.random() * CONFIG.CODE_ALPHABET.length));
    const code = "FST-" + suffix;
    if (!findUserByCode_(code)) return code;
  }
  throw new Error("No se pudo generar un código único. Intenta de nuevo.");
}

function hashPassword_(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty("PASSWORD_PEPPER");
  if (!pepper) throw new Error("El servidor no está configurado. Ejecuta setup().");
  let value = salt + "|" + password + "|" + pepper;
  for (let round = 0; round < CONFIG.HASH_ROUNDS; round += 1) value = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
  return value;
}

function hashToken_(token) { return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, token, Utilities.Charset.UTF_8)); }
function bytesToHex_(bytes) { return bytes.map((byte) => (byte < 0 ? byte + 256 : byte).toString(16).padStart(2, "0")).join(""); }
function constantTimeEqual_(left, right) { left = String(left); right = String(right); let diff = left.length ^ right.length; const length = Math.max(left.length, right.length); for (let i = 0; i < length; i += 1) diff |= (left.charCodeAt(i % (left.length || 1)) || 0) ^ (right.charCodeAt(i % (right.length || 1)) || 0); return diff === 0; }
function randomToken_() { return Utilities.base64EncodeWebSafe(Utilities.getUuid() + Utilities.getUuid()).replace(/=+$/, ""); }

function cleanName_(value) { const name = String(value || "").trim().replace(/\s+/g, " "); if (name.length < 2 || name.length > 80) throw new Error("Escribe un nombre válido."); return name; }
function cleanEmail_(value) { const email = String(value || "").trim().toLowerCase(); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 160) throw new Error("Escribe un correo válido."); return email; }
function cleanCode_(value) { const code = String(value || "").trim().toUpperCase(); if (!/^FST-[A-Z0-9]{8}$/.test(code)) throw new Error("El código no tiene un formato válido."); return code; }
function validatePassword_(password) { if (typeof password !== "string" || password.length < 8 || password.length > 128) throw new Error("La contraseña debe tener entre 8 y 128 caracteres."); }
function normalizeStamps_(value) { const stamps = Math.floor(Number(value) || 0); return Math.max(0, Math.min(CONFIG.MAX_STAMPS, stamps)); }

function cleanupSessions_() {
  const sheet = getSheet_(CONFIG.SESSIONS_SHEET);
  const rows = sheetObjects_(CONFIG.SESSIONS_SHEET).filter((row) => new Date(row.venceEn).getTime() <= Date.now()).map((row) => row.row).sort((a, b) => b - a);
  rows.forEach((row) => sheet.deleteRow(row));
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!id) throw new Error("Falta la propiedad SPREADSHEET_ID.");
  return SpreadsheetApp.openById(id);
}
function getSheet_(name) { const sheet = getSpreadsheet_().getSheetByName(name); if (!sheet) throw new Error("Falta la hoja " + name + ". Ejecuta setup()."); return sheet; }
function ensureSheet_(spreadsheet, name, headers) {
  const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
    sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
    return;
  }
  const actualHeaders = sheet.getRange(1, 1, 1, headers.length).getValues()[0].map(String);
  if (actualHeaders.some((header, index) => header !== headers[index])) {
    throw new Error("Los encabezados de la hoja " + name + " no coinciden con la configuración esperada.");
  }
}
function json_(payload) { return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON); }
