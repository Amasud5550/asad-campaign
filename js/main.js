/* Asad Mahmood for Thorold — site interactions */
(function () {
  "use strict";

  /* Footer / page year */
  var y = document.getElementById("year");
  if (y) y.textContent = String(new Date().getFullYear());

  /* Election-day countdown chip in the banner */
  var cd = document.getElementById("election-countdown");
  if (cd) {
    var electionDay = new Date(2026, 9, 26); // October 26, 2026 (local time)
    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var days = Math.ceil((electionDay - today) / 86400000);
    if (days > 1) {
      cd.textContent = days + " days to go";
      cd.hidden = false;
    } else if (days === 1) {
      cd.textContent = "Tomorrow!";
      cd.hidden = false;
    } else if (days === 0) {
      cd.textContent = "Today — go vote!";
      cd.hidden = false;
    }
  }

  /* Mobile navigation */
  var toggle = document.querySelector(".nav__toggle");
  var links = document.getElementById("primary-nav");

  if (toggle && links) {
    var closeMenu = function () {
      links.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");
      toggle.setAttribute("aria-label", "Open menu");
    };

    toggle.addEventListener("click", function () {
      var open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    });

    links.addEventListener("click", function (e) {
      if (e.target.tagName === "A" && links.classList.contains("is-open")) closeMenu();
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && links.classList.contains("is-open")) {
        closeMenu();
        toggle.focus();
      }
    });
  }

  /* Gold reading-progress bar */
  var bar = document.querySelector(".progress-bar");
  if (bar) {
    var onProgress = function () {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = max > 0 ? (window.scrollY / max) * 100 + "%" : "0%";
    };
    onProgress();
    window.addEventListener("scroll", onProgress, { passive: true });
    window.addEventListener("resize", onProgress, { passive: true });
  }

  /* Header shadow on scroll (works on every page, with or without id) */
  var header = document.getElementById("header") || document.querySelector(".site-header");

  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-scrolled", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* Scroll-reveal animations */
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
