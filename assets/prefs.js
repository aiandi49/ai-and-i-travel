// Text size and theme controls, shared by every page.
// The inline script in <head> restores saved choices before first paint;
// this file wires up the buttons and keeps their states in sync.
(function () {
  "use strict";
  var root = document.documentElement;
  var SIZES = ["sm", "md", "lg", "xl"];
  var SIZE_NAMES = { sm: "small", md: "medium", lg: "large", xl: "extra large" };

  function save(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function syncSize() {
    var current = root.getAttribute("data-font-size") || "sm";
    document.querySelectorAll("[data-size]").forEach(function (btn) {
      var size = btn.getAttribute("data-size");
      var on = size === current;
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.setAttribute("aria-label", "Text size " + SIZE_NAMES[size] + (on ? ", selected" : ""));
    });
  }

  function syncTheme() {
    var dark = root.getAttribute("data-theme") === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.setAttribute("aria-label", dark ? "Dark theme on. Switch to light theme" : "Light theme on. Switch to dark theme");
      var label = btn.querySelector(".theme-label");
      if (label) label.textContent = dark ? "Dark" : "Light";
    });
  }

  document.querySelectorAll("[data-size]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var size = btn.getAttribute("data-size");
      if (SIZES.indexOf(size) === -1) return;
      root.setAttribute("data-font-size", size);
      save("pref-font-size", size);
      syncSize();
      document.dispatchEvent(new CustomEvent("prefs:change"));
    });
  });

  document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      save("pref-theme", next);
      syncTheme();
      document.dispatchEvent(new CustomEvent("prefs:change"));
    });
  });

  syncSize();
  syncTheme();
})();
