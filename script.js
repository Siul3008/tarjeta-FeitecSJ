const STORAGE_KEY = "tarjetaFidelidadData";

const defaultData = {
  cliente: "Kiara González Roberts",
  codigo: "CLIENTE-001",
  sellos: 1,
  totalSellos: 10
};

let data = loadData();

const stampsContainer = document.getElementById("stamps");
const customerName = document.getElementById("customerName");
const customerCode = document.getElementById("customerCode");

const editCustomerBtn = document.getElementById("editCustomerBtn");
const resetBtn = document.getElementById("resetBtn");

const customerDialog = document.getElementById("customerDialog");
const customerForm = document.getElementById("customerForm");
const cancelDialogBtn = document.getElementById("cancelDialogBtn");
const nameInput = document.getElementById("nameInput");
const codeInput = document.getElementById("codeInput");

function loadData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);

    if (!saved) {
      return { ...defaultData };
    }

    return {
      ...defaultData,
      ...JSON.parse(saved)
    };
  } catch (error) {
    console.error("No se pudo cargar la información guardada:", error);
    return { ...defaultData };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function render() {
  customerName.textContent = data.cliente;
  customerCode.textContent = data.codigo;

  stampsContainer.innerHTML = "";

  for (let i = 0; i < data.totalSellos; i++) {
    const stamp = document.createElement("button");
    const isFilled = i < data.sellos;

    stamp.type = "button";
    stamp.className = `stamp${isFilled ? " filled" : ""}`;
    stamp.setAttribute(
      "aria-label",
      isFilled
        ? `Sello ${i + 1} marcado. Toca para dejar ${i} sellos.`
        : `Sello ${i + 1} vacío. Toca para marcar hasta este sello.`
    );

    stamp.addEventListener("click", () => {
      const selectedPosition = i + 1;

      if (selectedPosition === data.sellos) {
        data.sellos = i;
      } else {
        data.sellos = selectedPosition;
      }

      saveData();
      render();
    });

    stampsContainer.appendChild(stamp);
  }
}

editCustomerBtn.addEventListener("click", () => {
  nameInput.value = data.cliente;
  codeInput.value = data.codigo;
  customerDialog.showModal();
});

cancelDialogBtn.addEventListener("click", () => {
  customerDialog.close();
});

customerForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const newName = nameInput.value.trim();
  const newCode = codeInput.value.trim();

  if (!newName || !newCode) {
    return;
  }

  data.cliente = newName;
  data.codigo = newCode;

  saveData();
  render();
  customerDialog.close();
});

resetBtn.addEventListener("click", () => {
  const confirmed = window.confirm("¿Quieres reiniciar todos los sellos?");

  if (!confirmed) {
    return;
  }

  data.sellos = 0;
  saveData();
  render();
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./sw.js")
      .catch((error) => console.error("Service Worker:", error));
  });
}

render();
