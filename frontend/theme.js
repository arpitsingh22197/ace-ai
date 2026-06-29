// Theme toggle for InterviewAce AI.
// Lives in its own file because the app's Content-Security-Policy
// (script-src 'self') blocks inline <script> tags and inline
// onclick="" attributes — only same-origin external files like this
// one are allowed to run.

(function () {
  try {
    var saved = localStorage.getItem("iace-theme");
    var theme = saved || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", theme);
  } catch (e) {
    document.documentElement.setAttribute("data-theme", "light");
  }
})();

document.addEventListener("click", function (e) {
  var btn = e.target.closest(".theme-toggle");
  if (!btn) return;
  var root = document.documentElement;
  var current = root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  var next = current === "dark" ? "light" : "dark";
  root.setAttribute("data-theme", next);
  try {
    localStorage.setItem("iace-theme", next);
  } catch (err) {}
});