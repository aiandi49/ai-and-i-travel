// AI&I Travel guide. Renders data/gub.json with textContent only.
(function () {
  "use strict";
  var toc = document.getElementById("toc-list");
  var host = document.getElementById("entries");
  var errorBox = document.getElementById("load-error");

  function make(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function render(data) {
    var entries = Array.isArray(data && data.entries) ? data.entries : [];
    entries.forEach(function (e) {
      if (!e || typeof e.id !== "string" || !/^[a-z0-9-]+$/.test(e.id)) return;

      var li = make("li");
      var a = make("a");
      a.href = "#" + e.id;
      a.appendChild(make("span", "toc-title", e.title));
      a.appendChild(make("span", "toc-sum", e.summary));
      li.appendChild(a);
      toc.appendChild(li);

      var section = make("section", "entry");
      section.id = e.id;
      section.setAttribute("aria-labelledby", e.id + "-title");
      var wrap = make("div", "wrap entry-grid");

      var head = make("div", "entry-head");
      var h2 = make("h2", "", e.title);
      h2.id = e.id + "-title";
      head.appendChild(h2);
      head.appendChild(make("p", "entry-sum", e.summary));
      if (Array.isArray(e.tags) && e.tags.length) {
        var tags = make("ul", "tags");
        tags.setAttribute("aria-label", "Topics");
        e.tags.slice(0, 8).forEach(function (t) { tags.appendChild(make("li", "", t)); });
        head.appendChild(tags);
      }
      var plan = make("a", "plan-link", "Plan this with the planner");
      plan.href = "/";
      head.appendChild(plan);

      var body = make("div", "entry-body");
      (Array.isArray(e.body) ? e.body : []).forEach(function (p) { body.appendChild(make("p", "", p)); });

      if (e.details && typeof e.details === "object") {
        var table = make("table", "details");
        table.appendChild(make("caption", "", "At a glance"));
        var tbody = make("tbody");
        Object.keys(e.details).forEach(function (k) {
          var tr = make("tr");
          var th = make("th", "", k);
          th.scope = "row";
          tr.appendChild(th);
          tr.appendChild(make("td", "", String(e.details[k])));
          tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        body.appendChild(table);
      }

      wrap.appendChild(head);
      wrap.appendChild(body);
      section.appendChild(wrap);
      host.appendChild(section);
    });

    if (location.hash.length > 1) {
      var target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
      if (target) target.scrollIntoView();
    }
  }

  fetch("/data/gub.json", { headers: { Accept: "application/json" } })
    .then(function (r) { if (!r.ok) throw new Error("status"); return r.json(); })
    .then(render)
    .catch(function () { errorBox.hidden = false; });
})();
