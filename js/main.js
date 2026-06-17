/* Asad Mahmood for Thorold — site interactions */
(function () {
  "use strict";

  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());

  var toggle = document.querySelector(".nav__toggle");
  var links = document.getElementById("primary-nav");

  if (toggle && links) {
    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && links.classList.contains("is-open")) {
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.setAttribute("aria-label", "Open menu");
      }
    });
  }

  var header = document.getElementById("header");

  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  var reduce =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var reveals = Array.prototype.slice.call(
    document.querySelectorAll(".reveal:not(.in)")
  );

  if (reduce || !("IntersectionObserver" in window)) {
    reveals.forEach(function (el) {
      el.classList.add("in");
    });
  } else {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.08 }
    );

    reveals.forEach(function (el) {
      io.observe(el);
    });
  }
})();