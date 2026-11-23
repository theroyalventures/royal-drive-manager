
"use strict";

/* =========================================================
   ROYAL DRIVE DELHI NCR
   Fleet Management Application
   Frontend: GitHub Pages
   Backend: Google Apps Script
========================================================= */

const $ = id => document.getElementById(id);

const DEFAULT_DB = {
  fleet: [
    { id: "V001", name: "Maruti Fronx Delta Petrol Manual", type: "Own", rate: 2298, fuel: "Petrol", status: "Available" },
    { id: "V002", name: "Maruti Baleno Delta 5MT Petrol", type: "Own", rate: 2174, fuel: "Petrol", status: "Available" },
    { id: "V003", name: "Tata Punch", type: "Partner", rate: 2174, fuel: "Petrol", status: "Available" }
  ],
  bookings: [],
  requirements: [],
  feedback: [],
  suggestions: []
};

let db = structuredClone(DEFAULT_DB);
let apiURL = localStorage.getItem("rd_api_url") || "";
let currentPage = "dashboard";
let editingRecord = null;
let toastTimer = null;


/* =========================================================
   GENERAL HELPERS
========================================================= */

function uid(prefix = "RD") {
  return prefix + Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 6).toUpperCase();
}

function money(value) {
  return "₹" + Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

function number(value) {
  return Number(value) || 0;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[char]);
}

function dateText(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHTML(value);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function dateTimeText(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return escapeHTML(value);
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function todayISO() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 10);
}

function localDateTimeInput(value = new Date()) {
  const d = new Date(value);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000)
    .toISOString().slice(0, 16);
}

function showToast(message) {
  const el = $("toast");
  if (!el) return;

  el.textContent = message;
  el.classList.add("show");

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

function setConnection(online, message) {
  if ($("connectionDot")) {
    $("connectionDot").style.background = online ? "#37c98b" : "#f07878";
  }
  if ($("connectionText")) {
    $("connectionText").textContent = message;
  }
}

function saveLocalDB() {
  localStorage.setItem("rd_database", JSON.stringify(db));
}

function loadLocalDB() {
  try {
    const stored = JSON.parse(localStorage.getItem("rd_database") || "null");
    db = {
      ...structuredClone(DEFAULT_DB),
      ...(stored || {})
    };
  } catch {
    db = structuredClone(DEFAULT_DB);
  }
}

function normaliseDB(data = {}) {
  return {
    fleet: Array.isArray(data.fleet) ? data.fleet : [],
    bookings: Array.isArray(data.bookings) ? data.bookings : [],
    requirements: Array.isArray(data.requirements) ? data.requirements : [],
    feedback: Array.isArray(data.feedback) ? data.feedback : [],
    suggestions: Array.isArray(data.suggestions) ? data.suggestions : []
  };
}


/* =========================================================
   GOOGLE APPS SCRIPT API - JSONP
========================================================= */

function apiCall(action, data = {}, auth = true) {
  return new Promise((resolve, reject) => {
    if (!apiURL) {
      reject(new Error("Backend URL is not configured."));
      return;
    }

    let url;

    try {
      url = new URL(apiURL);
    } catch {
      reject(new Error("Invalid Google Apps Script URL."));
      return;
    }

    if (!url.hostname.includes("google.com")) {
      reject(new Error("Please enter a valid Google Apps Script Web App URL."));
      return;
    }

    const callback = "rd_callback_" + Date.now() +
      "_" + Math.random().toString(36).slice(2, 7);

    url.searchParams.set("action", action);
    url.searchParams.set("data", JSON.stringify(data));
    url.searchParams.set("callback", callback);

    if (auth) {
      url.searchParams.set(
        "token",
        localStorage.getItem("rd_token") || ""
      );
    }

    if (action === "login") {
      url.searchParams.set("pin", data.pin || "");
    }

    const script = document.createElement("script");
    let finished = false;

    const cleanup = () => {
      delete window[callback];
      script.remove();
    };

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(new Error("Server timeout. Please check your backend deployment."));
    }, 20000);

    window[callback] = response => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();

      if (response && response.ok) {
        resolve(response);
      } else {
        reject(new Error(response?.error || "Server request failed."));
      }
    };

    script.onerror = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      cleanup();
      reject(new Error("Backend connection failed. Check deployment URL and access."));
    };

    script.src = url.toString();
    document.body.appendChild(script);
  });
}


/* =========================================================
   AUTHENTICATION
========================================================= */

async function login(event) {
  if (event) event.preventDefault();

  const pin = $("pin")?.value.trim() || "";
  const error = $("loginError");
  const button = $("loginButton");
  const buttonText = $("loginButtonText");

  error.textContent = "";

  if (!pin) {
    error.textContent = "Please enter your Admin PIN.";
    return;
  }

  button.disabled = true;
  buttonText.textContent = "VERIFYING...";

  try {
    if (apiURL) {
      const response = await apiCall("login", { pin }, false);

      if (!response.token) {
        throw new Error("Login token was not received from server.");
      }

      localStorage.setItem("rd_token", response.token);
      localStorage.removeItem("rd_auth");

      await loadData();
    } else {
      // Local demo mode only. Not suitable for production security.
      if (pin !== "1234") {
        throw new Error("Incorrect PIN. Demo PIN: 1234");
      }

      loadLocalDB();
      localStorage.setItem("rd_auth", "yes");
    }

    $("pin").value = "";
    enterApp();

  } catch (error) {
    error.textContent = error.message || "Login failed.";
  } finally {
    button.disabled = false;
    buttonText.textContent = "SECURE LOGIN";
  }
}

function enterApp() {
  $("loginScreen").classList.add("hidden");
  $("appScreen").classList.remove("hidden");

  $("apiUrl").value = apiURL;
  $("currentDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  navigate("dashboard");
  renderAll();

  setConnection(
    Boolean(apiURL),
    apiURL ? "Connected" : "Demo Mode"
  );
}

function logout() {
  localStorage.removeItem("rd_token");
  localStorage.removeItem("rd_auth");

  $("appScreen").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("pin").value = "";
  $("loginError").textContent = "";

  showToast("You have been logged out.");
}

function checkExistingSession() {
  const token = localStorage.getItem("rd_token");
  const demoAuth = localStorage.getItem("rd_auth");

  if (!apiURL && demoAuth === "yes") {
    loadLocalDB();
    enterApp();
    return;
  }

  if (apiURL && token) {
    loadData()
      .then(enterApp)
      .catch(() => {
        localStorage.removeItem("rd_token");
        setConnection(false, "Disconnected");
      });
  }
}


/* =========================================================
   LOAD AND SAVE DATA
========================================================= */

async function loadData() {
  const response = await apiCall("getAll", {});
  db = normaliseDB(response.data);
  setConnection(true, "Connected");
  return db;
}

async function refreshData() {
  if (!apiURL) {
    loadLocalDB();
    renderAll();
    showToast("Local data refreshed.");
    return;
  }

  try {
    await loadData();
    renderAll();
    showToast("Google Sheets data synchronized.");
  } catch (error) {
    setConnection(false, "Sync Failed");
    showToast(error.message);
  }
}

async function saveRecord(collection, item, action) {
  if (apiURL) {
    await apiCall(action, { item });
    await loadData();
  } else {
    const list = db[collection];
    const index = list.findIndex(x => x.id === item.id);

    if (index >= 0) {
      list[index] = { ...list[index], ...item };
    } else {
      list.push(item);
    }

    saveLocalDB();
  }

  renderAll();
}

async function deleteRecord(collection, id, action) {
  if (!confirm("Are you sure you want to delete this record?")) return;

  try {
    if (apiURL) {
      await apiCall(action, { id });
      await loadData();
    } else {
      db[collection] = db[collection].filter(x => x.id !== id);
      saveLocalDB();
    }

    renderAll();
    showToast("Record deleted successfully.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   NAVIGATION
========================================================= */

const PAGE_INFO = {
  dashboard: ["Dashboard", "Your business overview"],
  bookings: ["Bookings", "Manage customer bookings"],
  fleet: ["My Fleet", "Manage owned and partner vehicles"],
  requirements: ["Requirements", "Customer enquiries"],
  feedback: ["Guest Feedback", "Customer experiences"],
  suggestions: ["Suggestions", "Business improvement ideas"],
  reports: ["Reports", "Business performance"],
  settings: ["Settings", "Application configuration"]
};

function navigate(page) {
  if (!PAGE_INFO[page]) return;

  currentPage = page;

  document.querySelectorAll(".page-section").forEach(section => {
    section.classList.remove("active");
  });

  $("page-" + page)?.classList.add("active");

  document.querySelectorAll(".nav-item").forEach(button => {
    button.classList.toggle("active", button.dataset.page === page);
  });

  $("pageTitle").textContent = PAGE_INFO[page][0];
  $("pageSubtitle").textContent = PAGE_INFO[page][1];

  $("sidebar").classList.remove("open");

  renderPage(page);
}


/* =========================================================
   PRICING ENGINE
========================================================= */

/*
OWN FLEET:
Guest fee = 0%
Host commission = 0%

PARTNER FLEET:
Guest fee = 10% of base amount
Host commission = 20% of base amount
Host payout = 80% of base amount
Royal Drive earnings = guest fee + host commission
*/

function calculatePricing(base, fleetType) {
  base = Math.max(0, number(base));

  if (fleetType === "Partner") {
    const guestFee = base * 0.10;
    const commission = base * 0.20;
    const hostPayout = base - commission;

    return {
      base,
      guestFee,
      commission,
      hostPayout,
      total: base + guestFee,
      royalEarnings: guestFee + commission
    };
  }

  return {
    base,
    guestFee: 0,
    commission: 0,
    hostPayout: base,
    total: base,
    royalEarnings: base
  };
}

function bookingDuration(start, end) {
  const startDate = new Date(start);
  const endDate = new Date(end);

  if (
    Number.isNaN(startDate.getTime()) ||
    Number.isNaN(endDate.getTime()) ||
    endDate <= startDate
  ) return 0;

  return Math.ceil((endDate - startDate) / 86400000);
}

function updateBookingCalculation() {
  const vehicleId = $("bookingVehicle")?.value;
  const vehicle = db.fleet.find(v => v.id === vehicleId);

  if (!vehicle) return;

  const start = $("bookingStart")?.value;
  const end = $("bookingEnd")?.value;
  const days = bookingDuration(start, end);

  const base = number(vehicle.rate) * days;
  const pricing = calculatePricing(base, vehicle.type);

  $("bookingDuration").textContent = days
    ? days + (days === 1 ? " day" : " days")
    : "—";

  $("bookingBase").textContent = money(pricing.base);
  $("bookingGuestFee").textContent = money(pricing.guestFee);
  $("bookingCommission").textContent = money(pricing.commission);
  $("bookingHostPayout").textContent = money(pricing.hostPayout);
  $("bookingTotal").textContent = money(pricing.total);
}


/* =========================================================
   DASHBOARD
========================================================= */

function renderDashboard() {
  $("statVehicles").textContent = db.fleet.length;
  $("statBookings").textContent = db.bookings.length;

  const revenue = db.bookings
    .filter(b => b.status !== "Cancelled")
    .reduce((sum, b) => sum + number(b.total), 0);

  $("statRevenue").textContent = money(revenue);

  const active = db.bookings.filter(b =>
    ["Upcoming", "Ongoing"].includes(b.status)
  ).length;

  $("statActive").textContent = active;

  const recent = [...db.bookings]
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .slice(0, 7);

  $("recentBookings").innerHTML = recent.length
    ? renderBookingTable(recent, true)
    : `<div class="empty-state">No bookings available yet.</div>`;

  $("fleetOverview").innerHTML = db.fleet.length
    ? db.fleet.map(vehicle => `
      <div class="fleet-overview-row">
        <div>
          <strong>${escapeHTML(vehicle.name)}</strong>
          <p>${escapeHTML(vehicle.type)} Fleet · ${money(vehicle.rate)}/day</p>
        </div>
        <span class="status-badge ${vehicle.status === "Available" ? "available" : "ongoing"}">
          ${escapeHTML(vehicle.status)}
        </span>
      </div>
    `).join("")
    : `<div class="empty-state">No fleet data.</div>`;
}


/* =========================================================
   BOOKINGS
========================================================= */

function renderBookingTable(bookings, compact = false) {
  if (!bookings.length) {
    return `<div class="empty-state">No bookings found.</div>`;
  }

  return `
    <table>
      <thead>
        <tr>
          <th>Booking ID</th>
          <th>Guest</th>
          <th>Vehicle</th>
          <th>Start</th>
          <th>End</th>
          <th>Total</th>
          <th>Status</th>
          ${compact ? "" : "<th>Actions</th>"}
        </tr>
      </thead>
      <tbody>
        ${bookings.map(booking => `
          <tr>
            <td>${escapeHTML(booking.id)}</td>
            <td>
              <strong>${escapeHTML(booking.guest)}</strong>
              <br>${escapeHTML(booking.phone || "")}
            </td>
            <td>${escapeHTML(booking.vehicleName || "")}</td>
            <td>${dateTimeText(booking.start)}</td>
            <td>${dateTimeText(booking.end)}</td>
            <td>${money(booking.total)}</td>
            <td>
              <span class="status-badge ${String(booking.status || "").toLowerCase()}">
                ${escapeHTML(booking.status)}
              </span>
            </td>
            ${compact ? "" : `
              <td>
                <button class="action-button" data-edit="booking" data-id="${escapeHTML(booking.id)}">Edit</button>
                <button class="action-button" data-status-id="${escapeHTML(booking.id)}">Status</button>
                <button class="action-button danger" data-delete="booking" data-id="${escapeHTML(booking.id)}">Delete</button>
              </td>
            `}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderBookings() {
  const search = ($("bookingSearch")?.value || "").toLowerCase();
  const status = $("bookingStatusFilter")?.value || "all";

  const filtered = db.bookings.filter(b => {
    const matchesSearch = [
      b.id, b.guest, b.phone, b.vehicleName
    ].join(" ").toLowerCase().includes(search);

    const matchesStatus = status === "all" || b.status === status;
    return matchesSearch && matchesStatus;
  });

  $("bookingsContainer").innerHTML = renderBookingTable(filtered);
}

function bookingForm(existing = null) {
  editingRecord = existing
    ? { collection: "bookings", id: existing.id }
    : null;

  const selectedVehicle = existing?.vehicleId || db.fleet[0]?.id || "";

  const vehicleOptions = db.fleet.map(v => `
    <option value="${escapeHTML(v.id)}" ${v.id === selectedVehicle ? "selected" : ""}>
      ${escapeHTML(v.name)} (${escapeHTML(v.type)}) — ${money(v.rate)}/day
    </option>
  `).join("");

  openModal(existing ? "Edit Booking" : "Create Booking", `
    <form id="bookingForm">

      <div class="form-grid">

        <div>
          <label>Guest Name *</label>
          <input name="guest" required value="${escapeHTML(existing?.guest || "")}">
        </div>

        <div>
          <label>Mobile Number *</label>
          <input name="phone" required inputmode="tel" value="${escapeHTML(existing?.phone || "")}">
        </div>

      </div>

      <label>Select Vehicle *</label>
      <select name="vehicleId" id="bookingVehicle" required>
        ${vehicleOptions}
      </select>

      <div class="form-grid">

        <div>
          <label>Pickup Date & Time *</label>
          <input type="datetime-local" name="start" id="bookingStart" required value="${escapeHTML(existing?.start || localDateTimeInput())}">
        </div>

        <div>
          <label>Return Date & Time *</label>
          <input type="datetime-local" name="end" id="bookingEnd" required value="${escapeHTML(existing?.end || "")}">
        </div>

      </div>

      <label>Booking Status</label>
      <select name="status">
        ${["Upcoming", "Ongoing", "Complete", "Cancelled"].map(s =>
          `<option ${existing?.status === s || (!existing && s === "Upcoming") ? "selected" : ""}>${s}</option>`
        ).join("")}
      </select>

      <label>Notes</label>
      <textarea name="notes" rows="2">${escapeHTML(existing?.notes || "")}</textarea>

      <div class="pricing-summary">
        <h3>Automatic Price Calculation</h3>
        <p>Duration: <strong id="bookingDuration">—</strong></p>
        <p>Base Amount: <strong id="bookingBase">₹0</strong></p>
        <p>Guest Fee: <strong id="bookingGuestFee">₹0</strong></p>
        <p>Host Commission: <strong id="bookingCommission">₹0</strong></p>
        <p>Host Payout: <strong id="bookingHostPayout">₹0</strong></p>
        <div class="pricing-total">
          Guest Total: <strong id="bookingTotal">₹0</strong>
        </div>
      </div>

      <button class="primary-button" type="submit">
        ${existing ? "UPDATE BOOKING" : "SAVE BOOKING"}
      </button>

    </form>
  `);

  ["bookingVehicle", "bookingStart", "bookingEnd"].forEach(id => {
    $(id)?.addEventListener("change", updateBookingCalculation);
  });

  updateBookingCalculation();
}

async function submitBooking(event) {
  event.preventDefault();

  const form = event.target;
  const values = Object.fromEntries(new FormData(form).entries());

  const vehicle = db.fleet.find(v => v.id === values.vehicleId);
  if (!vehicle) {
    showToast("Please select a valid vehicle.");
    return;
  }

  const days = bookingDuration(values.start, values.end);
  if (!days) {
    showToast("Please select a valid return date and time.");
    return;
  }

  const base = number(vehicle.rate) * days;
  const pricing = calculatePricing(base, vehicle.type);

  const existing = editingRecord
    ? db.bookings.find(b => b.id === editingRecord.id)
    : null;

  const booking = {
    id: existing?.id || uid("BK"),
    guest: values.guest.trim(),
    phone: values.phone.trim(),
    vehicleId: vehicle.id,
    vehicleName: vehicle.name,
    fleetType: vehicle.type,
    start: values.start,
    end: values.end,
    base: pricing.base,
    guestFee: pricing.guestFee,
    commission: pricing.commission,
    hostPayout: pricing.hostPayout,
    total: pricing.total,
    status: values.status,
    notes: values.notes.trim(),
    createdAt: existing?.createdAt || new Date().toISOString()
  };

  try {
    await saveRecord("bookings", booking, "saveBooking");
    closeModal();
    showToast("Booking saved successfully.");
  } catch (error) {
    showToast(error.message);
  }
}

async function changeBookingStatus(id) {
  const booking = db.bookings.find(b => b.id === id);
  if (!booking) return;

  const status = prompt(
    "Enter new status: Upcoming, Ongoing, Complete, Cancelled",
    booking.status
  );

  if (!status) return;

  const allowed = ["Upcoming", "Ongoing", "Complete", "Cancelled"];
  if (!allowed.includes(status)) {
    showToast("Invalid booking status.");
    return;
  }

  try {
    if (apiURL) {
      await apiCall("updateBookingStatus", { id, status });
      await loadData();
    } else {
      booking.status = status;
      saveLocalDB();
    }

    renderAll();
    showToast("Booking status updated.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   FLEET MANAGEMENT
========================================================= */

function renderFleet() {
  const search = ($("fleetSearch")?.value || "").toLowerCase();
  const type = $("fleetTypeFilter")?.value || "all";

  const filtered = db.fleet.filter(v => {
    const matchesSearch = [v.name, v.fuel, v.type]
      .join(" ").toLowerCase().includes(search);

    return matchesSearch && (type === "all" || v.type === type);
  });

  $("fleetContainer").innerHTML = filtered.length
    ? filtered.map(v => `
      <article class="fleet-card">
        <span class="status-badge ${v.status === "Available" ? "available" : "ongoing"}">
          ${escapeHTML(v.status)}
        </span>

        <h3>${escapeHTML(v.name)}</h3>
        <p>Fleet Type: ${escapeHTML(v.type)}</p>
        <p>Fuel: ${escapeHTML(v.fuel || "Not specified")}</p>
        <div class="vehicle-rate">${money(v.rate)} <small>/ day</small></div>

        <div class="card-actions">
          <button class="action-button" data-edit="fleet" data-id="${escapeHTML(v.id)}">Edit</button>
          <button class="action-button danger" data-delete="fleet" data-id="${escapeHTML(v.id)}">Delete</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No vehicles found.</div>`;
}

function vehicleForm(existing = null) {
  editingRecord = existing
    ? { collection: "fleet", id: existing.id }
    : null;

  openModal(existing ? "Edit Vehicle" : "Add Vehicle", `
    <form id="fleetForm">

      <label>Vehicle Name *</label>
      <input name="name" required value="${escapeHTML(existing?.name || "")}" placeholder="e.g. Maruti Fronx Delta">

      <div class="form-grid">
        <div>
          <label>Fleet Type *</label>
          <select name="type">
            <option value="Own" ${existing?.type !== "Partner" ? "selected" : ""}>Own Fleet</option>
            <option value="Partner" ${existing?.type === "Partner" ? "selected" : ""}>Partner Fleet</option>
          </select>
        </div>

        <div>
          <label>Daily Rate (₹) *</label>
          <input type="number" name="rate" min="1" required value="${escapeHTML(existing?.rate ?? "")}">
        </div>
      </div>

      <div class="form-grid">
        <div>
          <label>Fuel Type</label>
          <select name="fuel">
            ${["Petrol", "Diesel", "CNG", "Electric", "Hybrid"].map(f =>
              `<option ${existing?.fuel === f ? "selected" : ""}>${f}</option>`
            ).join("")}
          </select>
        </div>

        <div>
          <label>Availability</label>
          <select name="status">
            ${["Available", "Unavailable"].map(s =>
              `<option ${existing?.status === s || (!existing && s === "Available") ? "selected" : ""}>${s}</option>`
            ).join("")}
          </select>
        </div>
      </div>

      <button class="primary-button" type="submit">
        ${existing ? "UPDATE VEHICLE" : "SAVE VEHICLE"}
      </button>

    </form>
  `);
}

async function submitFleet(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = editingRecord
    ? db.fleet.find(v => v.id === editingRecord.id)
    : null;

  const vehicle = {
    id: existing?.id || uid("V"),
    name: values.name.trim(),
    type: values.type,
    rate: number(values.rate),
    fuel: values.fuel,
    status: values.status
  };

  if (!vehicle.name || vehicle.rate <= 0) {
    showToast("Enter valid vehicle details.");
    return;
  }

  try {
    await saveRecord("fleet", vehicle, "saveFleet");
    closeModal();
    showToast("Vehicle saved successfully.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   REQUIREMENTS
========================================================= */

function renderRequirements() {
  const items = db.requirements;

  $("requirementsContainer").innerHTML = items.length ? `
    <table>
      <thead>
        <tr>
          <th>Customer</th>
          <th>Category</th>
          <th>Requirement</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${items.map(item => `
          <tr>
            <td>${escapeHTML(item.customer || item.title || "—")}</td>
            <td>${escapeHTML(item.category || "—")}</td>
            <td>${escapeHTML(item.details || item.title || "—")}</td>
            <td>${dateText(item.date)}</td>
            <td><span class="status-badge">${escapeHTML(item.status || "New")}</span></td>
            <td>
              <button class="action-button" data-edit="requirements" data-id="${escapeHTML(item.id)}">Edit</button>
              <button class="action-button danger" data-delete="requirements" data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty-state">No requirements available.</div>`;
}

function requirementForm(existing = null) {
  editingRecord = existing
    ? { collection: "requirements", id: existing.id }
    : null;

  openModal(existing ? "Edit Requirement" : "Add Requirement", `
    <form id="requirementForm">

      <label>Customer Name</label>
      <input name="customer" value="${escapeHTML(existing?.customer || "")}">

      <label>Category</label>
      <select name="category">
        ${["Self Drive Car", "Monthly Rental", "Airport Transfer", "Other"].map(x =>
          `<option ${existing?.category === x ? "selected" : ""}>${x}</option>`
        ).join("")}
      </select>

      <label>Requirement Title *</label>
      <input name="title" required value="${escapeHTML(existing?.title || "")}">

      <label>Details</label>
      <textarea name="details" rows="3">${escapeHTML(existing?.details || "")}</textarea>

      <label>Status</label>
      <select name="status">
        ${["New", "Contacted", "Converted", "Closed"].map(x =>
          `<option ${existing?.status === x || (!existing && x === "New") ? "selected" : ""}>${x}</option>`
        ).join("")}
      </select>

      <button class="primary-button" type="submit">SAVE REQUIREMENT</button>

    </form>
  `);
}

async function submitRequirement(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = editingRecord
    ? db.requirements.find(x => x.id === editingRecord.id)
    : null;

  const item = {
    id: existing?.id || uid("REQ"),
    ...values,
    date: existing?.date || todayISO()
  };

  try {
    await saveRecord("requirements", item, "saveRequirement");
    closeModal();
    showToast("Requirement saved.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   FEEDBACK
========================================================= */

function renderFeedback() {
  $("feedbackContainer").innerHTML = db.feedback.length
    ? db.feedback.map(item => `
      <article class="feedback-card">
        <h3>${escapeHTML(item.guest || "Guest")}</h3>
        <p>Rating: ${"★".repeat(Math.max(0, Math.min(5, number(item.rating))))}</p>
        <p>${escapeHTML(item.message || "")}</p>
        <p>${dateText(item.date)}</p>
        <div class="card-actions">
          <button class="action-button danger" data-delete="feedback" data-id="${escapeHTML(item.id)}">Delete</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">No feedback available.</div>`;
}

function feedbackForm() {
  editingRecord = null;

  openModal("Add Guest Feedback", `
    <form id="feedbackForm">

      <label>Guest Name *</label>
      <input name="guest" required>

      <label>Rating *</label>
      <select name="rating" required>
        <option value="5">5 - Excellent</option>
        <option value="4">4 - Very Good</option>
        <option value="3">3 - Good</option>
        <option value="2">2 - Average</option>
        <option value="1">1 - Poor</option>
      </select>

      <label>Feedback *</label>
      <textarea name="message" required rows="4"></textarea>

      <button class="primary-button" type="submit">SAVE FEEDBACK</button>

    </form>
  `);
}

async function submitFeedback(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(event.target).entries());

  const item = {
    id: uid("FB"),
    guest: values.guest.trim(),
    rating: number(values.rating),
    message: values.message.trim(),
    date: todayISO()
  };

  try {
    await saveRecord("feedback", item, "saveFeedback");
    closeModal();
    showToast("Feedback saved.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   SUGGESTIONS
========================================================= */

function renderSuggestions() {
  $("suggestionsContainer").innerHTML = db.suggestions.length ? `
    <table>
      <thead>
        <tr>
          <th>Title</th>
          <th>Category</th>
          <th>Details</th>
          <th>Date</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        ${db.suggestions.map(item => `
          <tr>
            <td>${escapeHTML(item.title)}</td>
            <td>${escapeHTML(item.category || "—")}</td>
            <td>${escapeHTML(item.details || "—")}</td>
            <td>${dateText(item.date)}</td>
            <td>${escapeHTML(item.status || "New")}</td>
            <td>
              <button class="action-button" data-edit="suggestions" data-id="${escapeHTML(item.id)}">Edit</button>
              <button class="action-button danger" data-delete="suggestions" data-id="${escapeHTML(item.id)}">Delete</button>
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  ` : `<div class="empty-state">No suggestions available.</div>`;
}

function suggestionForm(existing = null) {
  editingRecord = existing
    ? { collection: "suggestions", id: existing.id }
    : null;

  openModal(existing ? "Edit Suggestion" : "Add Suggestion", `
    <form id="suggestionForm">

      <label>Title *</label>
      <input name="title" required value="${escapeHTML(existing?.title || "")}">

      <label>Category</label>
      <select name="category">
        ${["Business", "Marketing", "Fleet", "Technology", "Customer Service", "Other"].map(x =>
          `<option ${existing?.category === x ? "selected" : ""}>${x}</option>`
        ).join("")}
      </select>

      <label>Details</label>
      <textarea name="details" rows="3">${escapeHTML(existing?.details || "")}</textarea>

      <label>Status</label>
      <select name="status">
        ${["New", "In Progress", "Implemented", "Rejected"].map(x =>
          `<option ${existing?.status === x || (!existing && x === "New") ? "selected" : ""}>${x}</option>`
        ).join("")}
      </select>

      <button class="primary-button" type="submit">SAVE SUGGESTION</button>

    </form>
  `);
}

async function submitSuggestion(event) {
  event.preventDefault();

  const values = Object.fromEntries(new FormData(event.target).entries());
  const existing = editingRecord
    ? db.suggestions.find(x => x.id === editingRecord.id)
    : null;

  const item = {
    id: existing?.id || uid("SG"),
    ...values,
    date: existing?.date || todayISO()
  };

  try {
    await saveRecord("suggestions", item, "saveSuggestion");
    closeModal();
    showToast("Suggestion saved.");
  } catch (error) {
    showToast(error.message);
  }
}


/* =========================================================
   REPORTS
========================================================= */

function renderReports() {
  const valid = db.bookings.filter(b => b.status !== "Cancelled");

  const own = valid.filter(b => b.fleetType === "Own");
  const partner = valid.filter(b => b.fleetType === "Partner");

  const ownRevenue = own.reduce((s, b) => s + number(b.total), 0);
  const partnerRevenue = partner.reduce((s, b) => s + number(b.total), 0);
  const hostPayout = partner.reduce((s, b) => s + number(b.hostPayout), 0);

  const royalEarnings = valid.reduce((s, b) => {
    return s + (
      b.fleetType === "Partner"
        ? number(b.guestFee) + number(b.commission)
        : number(b.total)
    );
  }, 0);

  $("reportOwnRevenue").textContent = money(ownRevenue);
  $("reportPartnerRevenue").textContent = money(partnerRevenue);
  $("reportHostPayout").textContent = money(hostPayout);
  $("reportEarnings").textContent = money(royalEarnings);

  $("reportsContainer").innerHTML = `
    <h3>Booking Summary</h3>
    <p>Total active/complete bookings: ${valid.length}</p>
    <p>Own fleet bookings: ${own.length}</p>
    <p>Partner fleet bookings: ${partner.length}</p>
    <p>Combined guest billing: ${money(ownRevenue + partnerRevenue)}</p>
    <p>Partner host payout: ${money(hostPayout)}</p>
    <p>Royal Drive calculated earnings: ${money(royalEarnings)}</p>
    <p class="helper-text">
      Figures are based on saved booking records and exclude cancelled bookings.
    </p>
    <button class="action-button" id="exportBookingsButton">Export Bookings CSV</button>
  `;

  $("exportBookingsButton")?.addEventListener("click", exportBookingsCSV);
}

function exportBookingsCSV() {
  const columns = [
    "id", "guest", "phone", "vehicleName", "fleetType",
    "start", "end", "base", "guestFee", "commission",
    "hostPayout", "total", "status", "notes"
  ];

  const rows = [
    columns,
    ...db.bookings.map(b => columns.map(key => b[key] ?? ""))
  ];

  const csv = rows.map(row =>
    row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(",")
  ).join("\r\n");

  const blob = new Blob(["\uFEFF" + csv], {
    type: "text/csv;charset=utf-8;"
  });

  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "Royal-Drive-Bookings-" + todayISO() + ".csv";
  link.click();

  URL.revokeObjectURL(link.href);
}


/* =========================================================
   SETTINGS
========================================================= */

async function saveBackendURL() {
  const value = $("apiUrl").value.trim();

  if (value && !value.startsWith("https://script.google.com/")) {
    $("apiMessage").textContent = "Enter a valid Google Apps Script Web App URL.";
    return;
  }

  if (!value) {
    $("apiMessage").textContent = "Backend URL cannot be empty for live mode.";
    return;
  }

  localStorage.setItem("rd_api_url", value);
  apiURL = value;

  $("apiMessage").textContent = "Backend URL saved. Please log out and log in again.";

  showToast("Backend URL saved.");
}

async function changeAdminPIN() {
  const oldPin = $("oldPin").value.trim();
  const newPin = $("newPin").value.trim();
  const confirmPin = $("confirmPin").value.trim();

  $("securityMessage").textContent = "";

  if (!oldPin || !newPin || !confirmPin) {
    $("securityMessage").textContent = "Please fill in all PIN fields.";
    return;
  }

  if (newPin.length < 4 || newPin.length > 12) {
    $("securityMessage").textContent = "New PIN must be 4 to 12 characters.";
    return;
  }

  if (newPin !== confirmPin) {
    $("securityMessage").textContent = "New PIN and confirmation do not match.";
    return;
  }

  if (!apiURL) {
    $("securityMessage").textContent =
      "PIN change is available after live backend setup.";
    return;
  }

  try {
    await apiCall("changePin", { oldPin, newPin });

    $("oldPin").value = "";
    $("newPin").value = "";
    $("confirmPin").value = "";

    $("securityMessage").textContent =
      "PIN updated. Please log in again with your new PIN.";

    localStorage.removeItem("rd_token");
    setTimeout(logout, 1200);

  } catch (error) {
    $("securityMessage").textContent = error.message;
  }
}


/* =========================================================
   MODAL MANAGEMENT
========================================================= */

function openModal(title, html) {
  $("modalTitle").textContent = title;
  $("modalBody").innerHTML = html;
  $("modalContainer").classList.remove("hidden");
}

function closeModal() {
  $("modalContainer").classList.add("hidden");
  $("modalBody").innerHTML = "";
  editingRecord = null;
}


/* =========================================================
   EDIT / DELETE ROUTING
========================================================= */

function handleEdit(collection, id) {
  const item = db[collection]?.find(x => x.id === id);
  if (!item) return;

  switch (collection) {
    case "fleet":
      vehicleForm(item);
      break;
    case "bookings":
      bookingForm(item);
      break;
    case "requirements":
      requirementForm(item);
      break;
    case "suggestions":
      suggestionForm(item);
      break;
  }
}

function handleDelete(collection, id) {
  const actions = {
    fleet: "deleteFleet",
    bookings: "deleteBooking",
    requirements: "deleteRequirement",
    feedback: "deleteFeedback",
    suggestions: "deleteSuggestion"
  };

  deleteRecord(collection, id, actions[collection]);
}


/* =========================================================
   RENDER SYSTEM
========================================================= */

function renderPage(page) {
  switch (page) {
    case "dashboard":
      renderDashboard();
      break;
    case "bookings":
      renderBookings();
      break;
    case "fleet":
      renderFleet();
      break;
    case "requirements":
      renderRequirements();
      break;
    case "feedback":
      renderFeedback();
      break;
    case "suggestions":
      renderSuggestions();
      break;
    case "reports":
      renderReports();
      break;
  }
}

function renderAll() {
  renderDashboard();
  renderBookings();
  renderFleet();
  renderRequirements();
  renderFeedback();
  renderSuggestions();
  renderReports();
}


/* =========================================================
   EVENT LISTENERS
========================================================= */

function bindEvents() {
  $("loginForm")?.addEventListener("submit", login);
  $("logoutButton")?.addEventListener("click", logout);

  $("togglePin")?.addEventListener("click", () => {
    const input = $("pin");
    const visible = input.type === "text";
    input.type = visible ? "password" : "text";
    $("togglePin").textContent = visible ? "Show" : "Hide";
    $("togglePin").setAttribute("aria-label", visible ? "Show PIN" : "Hide PIN");
  });

  document.querySelectorAll(".nav-item").forEach(button => {
    button.addEventListener("click", () => navigate(button.dataset.page));
  });

  document.querySelectorAll("[data-page]").forEach(button => {
    if (button.classList.contains("nav-item")) return;
    button.addEventListener("click", () => navigate(button.dataset.page));
  });

  $("menuToggle")?.addEventListener("click", () => {
    $("sidebar").classList.toggle("open");
  });

  $("addBookingButton")?.addEventListener("click", () => bookingForm());
  $("addVehicleButton")?.addEventListener("click", () => vehicleForm());
  $("addRequirementButton")?.addEventListener("click", () => requirementForm());
  $("addFeedbackButton")?.addEventListener("click", feedbackForm);
  $("addSuggestionButton")?.addEventListener("click", () => suggestionForm());

  $("bookingSearch")?.addEventListener("input", renderBookings);
  $("bookingStatusFilter")?.addEventListener("change", renderBookings);
  $("fleetSearch")?.addEventListener("input", renderFleet);
  $("fleetTypeFilter")?.addEventListener("change", renderFleet);

  $("saveApiButton")?.addEventListener("click", saveBackendURL);
  $("changePinButton")?.addEventListener("click", changeAdminPIN);

  $("closeModalButton")?.addEventListener("click", closeModal);
  $("modalBackdrop")?.addEventListener("click", closeModal);

  $("modalBody")?.addEventListener("submit", event => {
    switch (event.target.id) {
      case "bookingForm":
        submitBooking(event);
        break;
      case "fleetForm":
        submitFleet(event);
        break;
      case "requirementForm":
        submitRequirement(event);
        break;
      case "feedbackForm":
        submitFeedback(event);
        break;
      case "suggestionForm":
        submitSuggestion(event);
        break;
    }
  });

  document.addEventListener("click", event => {
    const edit = event.target.closest("[data-edit]");
    const del = event.target.closest("[data-delete]");
    const status = event.target.closest("[data-status-id]");
    const newBooking = event.target.closest('[data-action="new-booking"]');

    if (edit) {
      handleEdit(edit.dataset.edit, edit.dataset.id);
    }

    if (del) {
      handleDelete(del.dataset.delete, del.dataset.id);
    }

    if (status) {
      changeBookingStatus(status.dataset.statusId);
    }

    if (newBooking) {
      bookingForm();
    }
  });
}


/* =========================================================
   INITIALISE
========================================================= */

document.addEventListener("DOMContentLoaded", () => {
  bindEvents();

  $("currentDate").textContent = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  checkExistingSession();
});
