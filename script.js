// Pega aquí la URL /exec de tu implementación de Google Apps Script.
const API_URL = "https://script.google.com/macros/s/AKfycbyqVaHeFau688ztEYO0tadd9OAEl8FWlZEEpI8zPkTcPBtkG9lXh13h5hRIdGzG3KE_Bw/exec";
const SESSION_KEY = "festecSession";
const TOTAL_STAMPS = 10;
const $ = (selector) => document.querySelector(selector);
const views = ["loadingView", "authView", "clientView", "staffView"];
let session = readSession();
let selectedClient = null;
let scanner = null;
let toastTimer = null;

document.addEventListener("DOMContentLoaded", init);

function init() {
  bindEvents();
  if (!isConfigured()) {
    showView("authView");
    showToast("Falta configurar la URL de Apps Script en script.js.", true);
    return;
  }
  if (session?.token) restoreSession();
  else showView("authView");
}

function bindEvents() {
  $("#loginTab").addEventListener("click", () => setAuthMode("login"));
  $("#registerTab").addEventListener("click", () => setAuthMode("register"));
  $("#loginForm").addEventListener("submit", login);
  $("#registerForm").addEventListener("submit", register);
  $("#refreshClientBtn").addEventListener("click", loadMyProfile);
  document.querySelectorAll(".logout-button").forEach((button) => button.addEventListener("click", logout));
  $("#scannerBtn").addEventListener("click", toggleScanner);
  $("#lookupForm").addEventListener("submit", lookupFromForm);
  $("#addStampBtn").addEventListener("click", addStamp);
  $("#lookupCode").addEventListener("input", (event) => { event.target.value = normalizeCode(event.target.value); });
}

function isConfigured() {
  return API_URL.startsWith("https://script.google.com/macros/s/") && API_URL.endsWith("/exec");
}

function setAuthMode(mode) {
  const isLogin = mode === "login";
  $("#loginForm").hidden = !isLogin;
  $("#registerForm").hidden = isLogin;
  $("#loginTab").classList.toggle("active", isLogin);
  $("#registerTab").classList.toggle("active", !isLogin);
  $("#loginTab").setAttribute("aria-selected", String(isLogin));
  $("#registerTab").setAttribute("aria-selected", String(!isLogin));
}

async function login(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await withSubmit(form, async () => {
    const result = await api("login", { email: form.email.value.trim(), password: form.password.value });
    saveSession(result);
    form.reset();
    await enterApp();
  });
}

async function register(event) {
  event.preventDefault();
  const form = event.currentTarget;
  await withSubmit(form, async () => {
    const result = await api("register", { name: form.name.value.trim(), email: form.email.value.trim(), password: form.password.value });
    saveSession(result);
    form.reset();
    showToast("¡Tu tarjeta FESTEC está lista!");
    await enterApp();
  });
}

async function restoreSession() {
  try { await enterApp(); }
  catch (error) { clearSession(); showView("authView"); showToast(error.message, true); }
}

async function enterApp() {
  if (session.role === "encargado") {
    await api("me", {}, true);
    showView("staffView");
  } else await loadMyProfile();
}

async function loadMyProfile() {
  try {
    const user = await api("me", {}, true);
    session.role = user.role;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    if (user.role === "encargado") { showView("staffView"); return; }
    renderClient(user);
    showView("clientView");
  } catch (error) { handleError(error); }
}

function renderClient(user) {
  const count = Math.max(0, Math.min(TOTAL_STAMPS, Number(user.stamps) || 0));
  $("#customerName").textContent = user.name;
  $("#customerCode").textContent = user.code;
  $("#stampCounter").textContent = `${count} de ${TOTAL_STAMPS}`;
  $("#stamps").replaceChildren(...Array.from({ length: TOTAL_STAMPS }, (_, index) => {
    const stamp = document.createElement("span");
    stamp.className = `stamp${index < count ? " filled" : ""}`;
    stamp.setAttribute("aria-label", `Sello ${index + 1}: ${index < count ? "obtenido" : "pendiente"}`);
    return stamp;
  }));
  const qr = $("#customerQr");
  qr.replaceChildren();
  if (window.QRCode) new QRCode(qr, { text: user.code, width: 180, height: 180, colorDark: "#0A3323", colorLight: "#FFFEF7", correctLevel: QRCode.CorrectLevel.H });
  else qr.textContent = "No se pudo generar el QR.";
}

async function toggleScanner() {
  if (scanner) { await stopScanner(); return; }
  if (!window.Html5Qrcode) { showToast("No se pudo cargar el lector QR.", true); return; }
  try {
    $("#reader").hidden = false;
    $("#scannerBtn").textContent = "Cerrar cámara";
    scanner = new Html5Qrcode("reader");
    await scanner.start({ facingMode: "environment" }, { fps: 10, qrbox: { width: 230, height: 230 } }, async (decoded) => {
      const code = normalizeCode(decoded);
      await stopScanner();
      $("#lookupCode").value = code;
      await lookupClient(code);
    }, () => {});
  } catch (_) {
    scanner = null;
    $("#reader").hidden = true;
    $("#scannerBtn").textContent = "Activar cámara";
    showToast("No se pudo abrir la cámara. Revisa el permiso del navegador.", true);
  }
}

async function stopScanner() {
  if (scanner) {
    try { await scanner.stop(); } catch (_) {}
    try { scanner.clear(); } catch (_) {}
  }
  scanner = null;
  $("#reader").hidden = true;
  $("#scannerBtn").textContent = "Activar cámara";
}

async function lookupFromForm(event) {
  event.preventDefault();
  await lookupClient(normalizeCode(event.currentTarget.code.value));
}

async function lookupClient(code) {
  if (!/^FST-[A-Z0-9]{8}$/.test(code)) { showToast("El código no tiene un formato válido.", true); return; }
  try {
    const client = await api("getClient", { code }, true);
    selectedClient = client;
    $("#resultName").textContent = client.name;
    $("#resultStamps").textContent = client.stamps;
    $("#resultCode").textContent = client.code;
    $("#addStampBtn").disabled = Number(client.stamps) >= TOTAL_STAMPS;
    $("#addStampBtn").textContent = Number(client.stamps) >= TOTAL_STAMPS ? "Tarjeta completa" : "Agregar sello";
    $("#clientResult").hidden = false;
  } catch (error) { $("#clientResult").hidden = true; selectedClient = null; handleError(error); }
}

async function addStamp() {
  if (!selectedClient) return;
  const button = $("#addStampBtn");
  button.disabled = true;
  try {
    const result = await api("addStamp", { code: selectedClient.code }, true);
    selectedClient.stamps = result.stamps;
    $("#resultStamps").textContent = result.stamps;
    button.textContent = result.stamps >= TOTAL_STAMPS ? "Tarjeta completa" : "Agregar sello";
    button.disabled = result.stamps >= TOTAL_STAMPS;
    showToast(result.stamps >= TOTAL_STAMPS ? "¡Tarjeta completada!" : "Sello agregado correctamente.");
  } catch (error) { button.disabled = false; handleError(error); }
}

async function api(action, payload = {}, authenticated = false) {
  if (!isConfigured()) throw new Error("La aplicación todavía no está conectada con Apps Script.");
  const body = { action, ...payload };
  if (authenticated) body.token = session?.token;
  let response;
  try {
    response = await fetch(API_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), redirect: "follow" });
  } catch (_) { throw new Error("No se pudo conectar con el servidor."); }
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error || "Ocurrió un error inesperado.");
  return result.data;
}

async function withSubmit(form, task) {
  const button = form.querySelector("button[type='submit']");
  button.disabled = true;
  try { await task(); } catch (error) { handleError(error); } finally { button.disabled = false; }
}

function saveSession(data) { session = { token: data.token, role: data.role }; localStorage.setItem(SESSION_KEY, JSON.stringify(session)); }
function readSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (_) { return null; } }
function clearSession() { session = null; localStorage.removeItem(SESSION_KEY); }
async function logout() { await stopScanner(); clearSession(); selectedClient = null; $("#clientResult").hidden = true; showView("authView"); }
function showView(id) { views.forEach((viewId) => { $(`#${viewId}`).hidden = viewId !== id; }); }
function normalizeCode(value) { return String(value || "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, ""); }
function handleError(error) { if (/sesión|token|autentic/i.test(error.message)) { clearSession(); showView("authView"); } showToast(error.message, true); }
function showToast(message, isError = false) { clearTimeout(toastTimer); const toast = $("#toast"); toast.textContent = message; toast.classList.toggle("error", isError); toast.hidden = false; toastTimer = setTimeout(() => { toast.hidden = true; }, 4500); }

if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
