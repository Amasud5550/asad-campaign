/* Donation flow — validates against Ontario limits, then hands off to Stripe Checkout. */
(function () {
  "use strict";

  var form = document.getElementById("donate-form");
  if (!form) return;

  var status = document.getElementById("donate-status");
  var amountInput = document.getElementById("amount");
  var provinceSel = document.getElementById("province");
  var submit = document.getElementById("donate-submit");
  var buttons = Array.prototype.slice.call(document.querySelectorAll(".amount"));

  var MAX = 1200; // Municipal Elections Act, per candidate
  var MIN = 5;

  /* Suggested-amount buttons fill the input and toggle pressed state */
  buttons.forEach(function (b) {
    b.setAttribute("aria-pressed", "false");
    b.addEventListener("click", function () {
      buttons.forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
      b.setAttribute("aria-pressed", "true");
      amountInput.value = b.dataset.amt;
      amountInput.focus();
    });
  });
  amountInput.addEventListener("input", function () {
    buttons.forEach(function (x) {
      x.setAttribute("aria-pressed", x.dataset.amt === amountInput.value ? "true" : "false");
    });
  });

  function fail(msg) {
    status.className = "form__status err";
    status.textContent = msg;
    status.focus && status.focus();
    window.scrollTo({ top: status.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" });
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    status.className = "form__status";
    status.textContent = "";

    var amount = Math.round(parseFloat(amountInput.value));

    if (!amount || amount < MIN) return fail("Please enter an amount of at least $" + MIN + ".");
    if (amount > MAX) return fail("The legal maximum to one candidate is $" + MAX + ". Please enter a lower amount.");
    if (provinceSel.value !== "ON") return fail("Only individuals who normally live in Ontario may contribute to a municipal campaign.");
    if (!form.checkValidity()) { form.reportValidity(); return; }

    var payload = {
      amount: amount,
      firstName: document.getElementById("first").value.trim(),
      lastName: document.getElementById("last").value.trim(),
      email: document.getElementById("email").value.trim(),
      address: document.getElementById("address").value.trim(),
      city: document.getElementById("city").value.trim(),
      postal: document.getElementById("postal").value.trim(),
      province: "ON"
    };

    submit.disabled = true;
    submit.textContent = "Connecting to secure payment…";

    fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (!res.ok || !res.d.url) throw new Error(res.d.error || "Could not start checkout");
        window.location.href = res.d.url; // redirect to Stripe Checkout
      })
      .catch(function (err) {
        submit.disabled = false;
        submit.textContent = "Continue to secure payment";
        fail(
          "We couldn’t reach the payment service. " +
          (err && err.message ? err.message + ". " : "") +
          "Please try again, or email the campaign and we’ll help."
        );
      });
  });
})();