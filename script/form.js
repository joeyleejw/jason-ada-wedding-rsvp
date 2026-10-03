// =============================================================
// RSVP form: dynamic fields, validation, submission,
// thank-you modal, text share and calendar file
// =============================================================

// ---------- State ----------
let lastSubmission = {};
let isSubmitting = false;

// ---------- Element references ----------
const rsvpForm = document.getElementById("rsvp-form");
const nameInput = document.getElementById("name");
const invitedBySelect = document.getElementById("invitedBy");
const attendingSelect = document.getElementById("attending");
const attendingFields = document.getElementById("attending-fields");
const regretsField = document.getElementById("regrets-field");
const phoneInput = document.getElementById("phone");
const phoneError = document.getElementById("phone-error");
const guestsInput = document.getElementById("guests");
const guestNamesContainer = document.getElementById("guest-names-fields");
const hasChildrenCheckbox = document.getElementById("has-children");
const childrenWrapper = document.getElementById("children-wrapper");
const childrenInput = document.getElementById("children");
const babychairWrapper = document.getElementById("babychair-wrapper");
const babychairSelect = document.getElementById("babychair");
const messageInput = document.getElementById("message");
const modalEl = document.getElementById("confirmationModal");
const submitStatus = document.getElementById("submit-status");

// ---------- Constants ----------
const VENUE_MAPS = {
   googleMaps: "https://maps.google.com/?q=Xin+Cuisine+Chinese+Restaurant+Concorde+Hotel+Kuala+Lumpur",
   waze: "https://waze.com/ul?q=Concorde+Hotel+Kuala+Lumpur",
};

// The Apps Script web app URL lives in the form's action attribute (index.html)
const SCRIPT_URL = rsvpForm.action;

// How hard to try before telling the guest it failed
const SUBMIT_TRIES = 3; // attempts in total
const SUBMIT_TIMEOUT_MS = 20000; // per attempt (Apps Script can take a few seconds on a cold start)


// =============================================================
// Helpers
// =============================================================

// Translate a key (returns HTML: Chinese text is wrapped by formatZH)
function t(key) {
   const raw = translations[currentLang]?.[key] || translations.en[key] || key;
   return currentLang === "zh" ? formatZH(raw) : raw;
}

// Plain-text translation (no HTML, <br> becomes a space), for share text, alerts, etc.
function tPlain(key) {
   const raw = translations[currentLang]?.[key] || translations.en[key] || key;
   return raw.replace(/<br\s*\/?>/gi, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
}

// Escape anything a guest typed before it goes into HTML
function escapeHTML(value) {
   const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
   return String(value ?? "").replace(/[&<>"']/g, (c) => map[c]);
}

function refreshRowHeights() {
   if (typeof matchRowHeights === "function") matchRowHeights();
}

function setHidden(id, value) {
   document.getElementById(id).value = value;
}

function getGuestCount() {
   return Math.max(1, parseInt(guestsInput.value, 10) || 1);
}

function getChildrenCount() {
   return Math.max(0, parseInt(childrenInput.value, 10) || 0);
}

// =============================================================
// Attending: Yes / No sections
// =============================================================

attendingSelect.addEventListener("change", () => {
   const value = attendingSelect.value;
   attendingFields.style.display = value === "yes" ? "block" : "none";
   regretsField.style.display = value === "no" ? "block" : "none";

   if (value !== "yes") {
      guestNamesContainer.innerHTML = "";
      guestsInput.value = 1;
      resetChildren();
   }
});

// =============================================================
// Guest 2+ name and meal fields
// =============================================================

function renderGuestNames() {
   const count = getGuestCount();

   // Keep what was already typed/selected when the guest count changes
   const previousNames = Array.from(guestNamesContainer.querySelectorAll(".guest-name-input"), (el) => el.value);
   const previousMeals = Array.from(guestNamesContainer.querySelectorAll(".dietary-select"), (el) => el.value);

   let html = "";
   for (let i = 2; i <= count; i++) {
      const savedName = escapeHTML(previousNames[i - 2] || "");
      const savedMeal = previousMeals[i - 2] || "";
      const selected = (meal) => (savedMeal === meal ? "selected" : "");

      html += `
         <div class="mb-3">
            <h3 class="mb-2">${t("formGuestTitle").replace("{n}", i)}</h3>
            <div class="row">
               <div class="col-6">
                  <label data-i18n="formGuestsName"></label>
                  <input type="text" class="guest-name-input" data-guest="${i}" value="${savedName}" required>
               </div>
               <div class="col-6">
                  <label data-i18n="formMealLabel"></label>
                  <select class="dietary-select" id="dietary-select-${i}" data-guest="${i}">
                     <option value="Select" data-i18n="formMealSelect"></option>
                     <option value="Non-Halal" ${selected("Non-Halal")} data-i18n="formMealNonHalal"></option>
                     <option value="Halal" ${selected("Halal")} data-i18n="formMealHalal"></option>
                     <option value="Vegetarian" ${selected("Vegetarian")} data-i18n="formMealVegetarian"></option>
                  </select>
               </div>
            </div>
         </div>`;
   }

   guestNamesContainer.innerHTML = html;
   applyTranslations(currentLang);
   refreshRowHeights();
}

// Meal choice for every guest, as [{ name, meal }]
function getGuestMeals() {
   const mealOf = (select) => (select && select.value !== "Select" ? select.value : "None");
   const meals = [{ name: nameInput.value.trim() || "Guest 1", meal: mealOf(document.getElementById("dietary-select-1")) }];

   for (let i = 2; i <= getGuestCount(); i++) {
      const input = guestNamesContainer.querySelector(`.guest-name-input[data-guest="${i}"]`);
      meals.push({
         name: input?.value.trim() || `Guest ${i}`,
         meal: mealOf(document.getElementById(`dietary-select-${i}`)),
      });
   }
   return meals;
}

// =============================================================
// Phone number
// =============================================================

// 11 digits → 6012-345 6789, 12 digits → 6011-1234 5678
function formatPhone(digits) {
   if (digits.length <= 4) return digits;
   const midLength = digits.length === 12 ? 4 : 3;
   const mid = digits.slice(4, 4 + midLength);
   const rest = digits.slice(4 + midLength);
   return `${digits.slice(0, 4)}-${mid}${rest ? " " + rest : ""}`;
}

function isValidPhone() {
   const length = phoneInput.value.replace(/\D/g, "").length;
   return length === 11 || length === 12;
}

phoneInput.addEventListener("input", () => {
   phoneInput.value = formatPhone(phoneInput.value.replace(/\D/g, "").slice(0, 12));
   if (isValidPhone()) phoneError.style.display = "none";
});

// =============================================================
// Children and baby chairs
// =============================================================

function resetChildren() {
   hasChildrenCheckbox.checked = false;
   childrenInput.value = 0;
   childrenInput.disabled = true;
   childrenWrapper.style.display = "none";
   babychairSelect.innerHTML = `<option value="0" data-i18n="formBabyChairNo"></option>`;
   babychairWrapper.style.display = "none";
   applyTranslations(currentLang);
   refreshRowHeights();
}

// Chinese-only font sizing for the baby chair select
function updateBabyChairFontSize() {
   if (currentLang !== "zh") {
      babychairSelect.style.fontSize = "";
      return;
   }
   babychairSelect.style.fontSize = babychairSelect.value === "0" ? "1.5rem" : "1rem";
}

function renderBabyChairOptions() {
   const kids = getChildrenCount();
   const previousValue = babychairSelect.value;

   let options = `<option value="0" data-i18n="formBabyChairNo"></option>`;
   for (let i = 1; i <= kids; i++) options += `<option value="${i}">${i}</option>`;
   babychairSelect.innerHTML = options;

   const stillValid = previousValue && Number(previousValue) <= kids;
   babychairSelect.value = stillValid ? previousValue : "0";
   babychairWrapper.style.display = kids > 0 ? "block" : "none";

   applyTranslations(currentLang);
   updateBabyChairFontSize();
   refreshRowHeights();
}

hasChildrenCheckbox.addEventListener("change", () => {
   if (!hasChildrenCheckbox.checked) {
      resetChildren();
      return;
   }
   childrenWrapper.style.display = "block";
   childrenInput.disabled = false;
   if (getChildrenCount() === 0) childrenInput.value = 1;
   renderBabyChairOptions();
});

childrenInput.addEventListener("input", renderBabyChairOptions);

babychairSelect.addEventListener("change", () => {
   updateBabyChairFontSize();
   setTimeout(refreshRowHeights, 10);
});

// =============================================================
// Validation
// =============================================================

function fail(message, focusEl) {
   if (message) alert(message);
   focusEl?.focus();
   return false;
}

function validateForm(attending) {
   if (!nameInput.value.trim()) return fail(tPlain("formErrName"), nameInput);
   if (!invitedBySelect.value) return fail(tPlain("formErrSide"), invitedBySelect);
   if (!attending) return fail(tPlain("formErrAttend"), attendingSelect);

   if (attending === "yes") {
      if (!isValidPhone()) {
         phoneError.style.display = "block";
         return fail(null, phoneInput);
      }

      const guest1Select = document.getElementById("dietary-select-1");
      if (!guest1Select.value || guest1Select.value === "Select") {
         return fail(tPlain("formErrMeal"), guest1Select);
      }

      const emptyName = Array.from(guestNamesContainer.querySelectorAll(".guest-name-input")).find((el) => !el.value.trim());
      if (emptyName) return fail(tPlain("formErrGuestNames"), emptyName);
   }

   return true;
}

// =============================================================
// Submission (fetch to Google Apps Script, confirmed before we say "thank you")
// =============================================================

// One unique ID per RSVP. The script remembers it, so a retry (or a double tap)
// can never create a second row.
function newSubmissionId() {
   return window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function setSubmitStatus(key) {
   if (!submitStatus) return;
   if (!key) {
      submitStatus.style.display = "none";
      submitStatus.textContent = "";
      return;
   }
   submitStatus.textContent = tPlain(key);
   submitStatus.style.display = "block";
}

// Resolves true only when the script answers { result: "success" }.
// Anything else (timeout, network error, Google error page, { result: "error" }) is retried
// with a growing pause, then reported as a failure.
async function sendRSVP(body, onRetry) {
   for (let attempt = 1; attempt <= SUBMIT_TRIES; attempt++) {
      if (attempt > 1 && onRetry) onRetry(attempt);

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), SUBMIT_TIMEOUT_MS);
      try {
         const response = await fetch(SCRIPT_URL, { method: "POST", body, signal: controller.signal });
         const data = await response.json();
         if (data && data.result === "success") return true;
         console.warn("RSVP attempt", attempt, "rejected:", data);
      } catch (err) {
         console.warn("RSVP attempt", attempt, "failed:", err);
      } finally {
         clearTimeout(timer);
      }

      if (attempt < SUBMIT_TRIES) {
         // 1.5s, 3s, ... plus a little randomness so a crowd of guests doesn't retry in lockstep
         await new Promise((resolve) => setTimeout(resolve, 1500 * attempt + Math.random() * 1000));
      }
   }
   return false;
}

rsvpForm.addEventListener("submit", async (e) => {
   e.preventDefault(); // we send the data ourselves with fetch
   if (isSubmitting) return;

   const attending = attendingSelect.value;
   if (!validateForm(attending)) return;

   const isYes = attending === "yes";
   const phoneDigits = phoneInput.value.replace(/\D/g, "");
   const guestNames = isYes
      ? Array.from(guestNamesContainer.querySelectorAll(".guest-name-input"), (el) => el.value.trim())
      : [];
   const meals = isYes ? getGuestMeals() : [];

   lastSubmission = {
      name: nameInput.value.trim(),
      attending,
      guests: isYes ? String(getGuestCount()) : "",
      guestNames: guestNames.join(", "),
      children: isYes ? String(getChildrenCount()) : "0",
      babychair: isYes ? babychairSelect.value : "0",
      meals,
      message: attending === "no" ? messageInput.value.trim() : "",
   };

   // Copy values into the hidden fields that get posted to Google Sheets
   setHidden("name-hidden", lastSubmission.name);
   setHidden("invitedBy-hidden", invitedBySelect.value);
   setHidden("phone-hidden", isYes && phoneDigits ? "+" + phoneDigits : "");
   setHidden("attending-hidden", attending);
   setHidden("guests-hidden", lastSubmission.guests);
   setHidden("guestnames-hidden", lastSubmission.guestNames);
   setHidden("meals-hidden", meals.map((m) => `${m.name}: ${m.meal}`).join(", "));
   setHidden("children-hidden", isYes ? lastSubmission.children : "");
   setHidden("babychair-hidden", lastSubmission.babychair);
   setHidden("message-hidden", lastSubmission.message);

   // Only the inputs that have a name attribute (the hidden ones above) are included
   const body = new URLSearchParams(new FormData(rsvpForm));
   body.set("submissionId", newSubmissionId());

   const submitBtn = rsvpForm.querySelector('button[type="submit"]');
   isSubmitting = true;
   submitBtn.disabled = true;
   submitBtn.innerHTML = t("buttonSubmitting");
   setSubmitStatus("formSubmittingNote");

   const saved = await sendRSVP(body, () => setSubmitStatus("formSubmittingRetry"));

   isSubmitting = false;
   submitBtn.disabled = false;
   submitBtn.innerHTML = t("buttonSubmit");
   setSubmitStatus(null);

   if (!saved) {
      // Keep everything the guest typed so they can simply tap Submit again
      alert(tPlain("formSubmitError"));
      return;
   }

   showThankYouMessage(lastSubmission.attending);

   bootstrap.Modal.getOrCreateInstance(modalEl, {
      backdrop: "static", // clicking outside won't close it
      keyboard: false, // Esc won't close it
   }).show();

   resetForm();
});

// Warn before leaving the page while an RSVP is still being sent
window.addEventListener("beforeunload", (e) => {
   if (!isSubmitting) return;
   e.preventDefault();
   e.returnValue = "";
});

function resetForm() {
   rsvpForm.reset();
   attendingFields.style.display = "none";
   regretsField.style.display = "none";
   phoneError.style.display = "none";
   guestNamesContainer.innerHTML = "";
   resetChildren();
}

// =============================================================
// Thank-you modal
// =============================================================

// Switch the message key so it stays translated if the language changes
function showThankYouMessage(attending) {
   const messageEl = document.getElementById("modal-thank-you-message");
   messageEl.setAttribute("data-i18n", attending === "no" ? "modalThankYouNo" : "modalThankYouYes");
   applyTranslations(currentLang);
}

// =============================================================
// Share (text only, in the current language)
// =============================================================

function buildShareText() {
   return [
      `💍 ${tPlain("shareTitle")}`,
      "",
      tPlain("shareThankYou"),
      "",
      `📅 ${tPlain("RSVPdate")}`,
      `🥂 ${tPlain("RSVPreception")}`,
      `🍽️ ${tPlain("RSVPdinner")}`,
      "",
      `📍 ${tPlain("shareVenueLocation")}`,
      `Google Maps: ${VENUE_MAPS.googleMaps}`,
      "",
      `Waze: ${VENUE_MAPS.waze}`,
   ].join("\n");
}

async function shareInvitation() {
   const text = buildShareText();
   try {
      if (navigator.share) {
         await navigator.share({ text });
         return;
      }
      await navigator.clipboard.writeText(text);
      alert(tPlain("shareCopied"));
   } catch (err) {
      if (err.name === "AbortError") return; // guest closed the share sheet
      // Clipboard can be blocked in some in-app browsers: last-resort copy prompt
      window.prompt("", text);
   }
}

// =============================================================
// Add to Calendar (.ics with reminders)
// =============================================================

function downloadICSFile() {
   const event = {
      title: "Jason & Ada's Wedding",
      description: "Join us in celebrating the wedding of Jason and Ada!",
      location: "Xin Cuisine Chinese Restaurant, Concorde Hotel Kuala Lumpur",
      startDate: "20261212T180000", // adjust event start date/time as needed
      endDate: "20261212T220000",
   };

   const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

   const icsData = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Jason and Ada Wedding RSVP//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:jason-ada-wedding-20261212@rsvp",
      `DTSTAMP:${stamp}`,
      `SUMMARY:${event.title}`,
      `DESCRIPTION:${event.description}`,
      `LOCATION:${event.location}`,
      `DTSTART:${event.startDate}`,
      `DTEND:${event.endDate}`,
      "STATUS:CONFIRMED",

      // Reminder 1: 1 week before
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder: Jason & Ada's Wedding is in 1 week!",
      "TRIGGER:-P7D",
      "END:VALARM",

      // Reminder 2: 1 day before
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:Reminder: Jason & Ada's Wedding is tomorrow!",
      "TRIGGER:-P1D",
      "END:VALARM",

      "END:VEVENT",
      "END:VCALENDAR",
   ].join("\r\n");

   const url = URL.createObjectURL(new Blob([icsData], { type: "text/calendar;charset=utf-8" }));
   const link = document.createElement("a");
   link.href = url;
   link.download = "Jason-Ada-Wedding.ics";
   document.body.appendChild(link);
   link.click();
   link.remove();
   setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =============================================================
// Event wiring and initial state
// =============================================================

guestsInput.addEventListener("input", renderGuestNames);

document.getElementById("share-response-btn").addEventListener("click", (e) => {
   e.preventDefault();
   shareInvitation();
});

document.getElementById("add-calendar-btn")?.addEventListener("click", (e) => {
   e.preventDefault();
   downloadICSFile();
});

// The modal only closes via the X. The form was already cleared after a successful send,
// so there is no page reload (it forced guests to re-download fonts and images).
modalEl.addEventListener("hidden.bs.modal", () => {
   window.scrollTo({ top: 0 });
});

childrenInput.disabled = true;
renderGuestNames();
renderBabyChairOptions();