// AI&I Travel planner. Talks only to /api/chat. Renders all text with textContent.
(function () {
  "use strict";

  var STORE_KEY = "aiandi-planner-v1";
  var HIDDEN_DETAIL_KEYS = ["Next step", "Guide", "Type"];
  var CIRC = 2 * Math.PI * 16;
  // Conversation-length settings. These must stay within the limits in api/chat.js.
  var HISTORY_BYTES = 30000;   // api/chat.js rejects requests over 32 KB
  var HISTORY_MAX = 39;        // api/chat.js accepts up to 40 messages
  var ASSISTANT_MAX = 12000;   // api/chat.js MAX_ASSISTANT_CHARS
  var SILENCE_MS = 10000;      // mic turns off after this long without speech

  var el = {
    log: document.getElementById("log"),
    empty: document.getElementById("empty"),
    msg: document.getElementById("msg"),
    send: document.getElementById("send-btn"),
    mic: document.getElementById("mic-btn"),
    micMsg: document.getElementById("mic-msg"),
    count: document.getElementById("count-chip"),
    reset: document.getElementById("reset-btn"),
    download: document.getElementById("download-btn"),
    full: document.getElementById("full-btn"),
    card: document.getElementById("chat-card"),
    slot: document.getElementById("chat-slot"),
    topKind: document.getElementById("top-kind"),
    topTitle: document.getElementById("top-title-text"),
    topScore: document.getElementById("top-score"),
    topWhy: document.getElementById("top-why"),
    gaugeFill: document.getElementById("gauge-fill"),
    gaugeNum: document.getElementById("gauge-num"),
    rankNote: document.getElementById("rank-note"),
    shortList: document.getElementById("short-list"),
    detailsName: document.getElementById("details-name"),
    detailsList: document.getElementById("details-list"),
    guideLink: document.getElementById("guide-link"),
    nextText: document.getElementById("next-text")
  };

  var state = load();
  var busy = false;

  function load() {
    try {
      var raw = sessionStorage.getItem(STORE_KEY);
      if (raw) {
        var data = JSON.parse(raw);
        if (data && Array.isArray(data.messages) && Array.isArray(data.matches)) {
          return { messages: data.messages, matches: data.matches.map(cleanMatch).filter(Boolean), selected: typeof data.selected === "string" ? data.selected : null };
        }
      }
    } catch (e) { /* ignore */ }
    return { messages: [], matches: [], selected: null };
  }

  function save() {
    try { sessionStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- MATCH lines ----------
  function cleanMatch(m) {
    if (!m || typeof m !== "object") return null;
    var title = typeof m.title === "string" ? m.title.trim().slice(0, 140) : "";
    if (!title) return null;
    var score = Number(m.score);
    if (!isFinite(score)) score = 0;
    score = Math.max(0, Math.min(100, Math.round(score)));
    var id = typeof m.id === "string" ? m.id.toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60) : "";
    if (!id) id = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "option";
    var why = typeof m.why === "string" ? m.why.trim().slice(0, 300) : "";
    var details = {};
    if (m.details && typeof m.details === "object" && !Array.isArray(m.details)) {
      Object.keys(m.details).slice(0, 12).forEach(function (k) {
        var v = m.details[k];
        if (typeof v === "number") v = String(v);
        if (typeof v === "string" && v.trim()) details[String(k).slice(0, 40)] = v.trim().slice(0, 400);
      });
    }
    return { id: id, title: title, score: score, why: why, details: details };
  }

  function splitReply(text) {
    var visible = [];
    var found = [];
    String(text).split(/\r?\n/).forEach(function (line) {
      var t = line.replace(/^\s*(?:[-*]\s*)?/, "");
      if (/^MATCH:/i.test(t)) {
        var json = t.replace(/^MATCH:\s*/i, "");
        try {
          var m = cleanMatch(JSON.parse(json));
          if (m) found.push(m);
        } catch (e) { /* malformed line: drop it */ }
        return;
      }
      visible.push(line);
    });
    var seen = {};
    found = found.filter(function (m) {
      if (seen[m.id]) { m.id = m.id + "-" + Object.keys(seen).length; }
      seen[m.id] = true;
      return true;
    });
    found.sort(function (a, b) { return b.score - a.score; });
    return { text: visible.join("\n").replace(/\n{3,}/g, "\n\n").trim(), matches: found };
  }

  // ---------- Rendering ----------
  // Plain text with https links made clickable, built from text nodes (no HTML parsing).
  function fillText(node, text, links) {
    if (!links) { node.textContent = text; return; }
    var re = /https:\/\/[^\s<>"]+/g;
    var last = 0, m;
    while ((m = re.exec(text))) {
      var url = m[0].replace(/[).,;:!?]+$/, "");
      if (m.index > last) node.appendChild(document.createTextNode(text.slice(last, m.index)));
      var a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = url;
      node.appendChild(a);
      last = m.index + url.length;
      re.lastIndex = last;
    }
    if (last < text.length) node.appendChild(document.createTextNode(text.slice(last)));
  }

  function addBubble(role, text, extraClass) {
    var div = document.createElement("div");
    div.className = "msg " + role + (extraClass ? " " + extraClass : "");
    fillText(div, text, role === "assistant" && !extraClass);
    el.log.appendChild(div);
    return div;
  }

  // Three animated dots while the planner works, with a reassuring note on long waits.
  function addThinking() {
    var div = document.createElement("div");
    div.className = "msg assistant pending";
    var dots = document.createElement("span");
    dots.className = "dots";
    dots.setAttribute("aria-hidden", "true");
    for (var i = 0; i < 3; i++) dots.appendChild(document.createElement("span"));
    var label = document.createElement("span");
    label.className = "sr-only";
    label.textContent = "The planner is working on your trip.";
    var note = document.createElement("span");
    note.className = "pending-note";
    note.hidden = true;
    div.appendChild(dots);
    div.appendChild(label);
    div.appendChild(note);
    el.log.appendChild(div);
    var t1 = setTimeout(function () { note.textContent = "Still working. Live fare searches can take up to a minute."; note.hidden = false; scrollLog(); }, 8000);
    var t2 = setTimeout(function () { note.textContent = "Almost there. Comparing routes and prices."; }, 30000);
    var removeEl = div.remove.bind(div);
    div.remove = function () { clearTimeout(t1); clearTimeout(t2); removeEl(); };
    return div;
  }

  // ---------- Download ----------
  // Builds a plain-text trip plan in the browser. No server call and no API cost.
  function buildPlanText() {
    var NL = "\r\n";
    var out = ["AI&I Travel: Trip plan", "Saved " + new Date().toLocaleString(), "",
      "Prices were checked during this conversation and change all the time.",
      "Confirm every fare on the airline's own site before paying.", ""];
    if (state.matches.length) {
      out.push("RANKED OPTIONS", "");
      state.matches.forEach(function (m, i) {
        out.push((i + 1) + ". " + m.title + " (fit " + m.score + "/100)");
        if (m.why) out.push("   Why: " + m.why);
        Object.keys(m.details).forEach(function (k) {
          if (k === "Guide") return;
          out.push("   " + k + ": " + m.details[k]);
        });
        out.push("");
      });
    }
    var lastPlan = "";
    for (var i = state.messages.length - 1; i >= 0; i--) {
      if (state.messages[i].role === "assistant") { lastPlan = splitReply(state.messages[i].content).text; break; }
    }
    if (lastPlan) out.push("LATEST PLAN", "", lastPlan, "");
    out.push("FULL CONVERSATION", "");
    state.messages.forEach(function (m) {
      var text = m.role === "assistant" ? splitReply(m.content).text : m.content;
      out.push((m.role === "user" ? "You: " : "Planner: ") + text, "");
    });
    return "\uFEFF" + out.join("\n").replace(/\r?\n/g, NL);
  }

  function downloadPlan() {
    if (!state.messages.some(function (m) { return m.role === "assistant"; })) return;
    var d = new Date();
    var stamp = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    var blob = new Blob([buildPlanText()], { type: "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = "ai-and-i-travel-plan-" + stamp + ".txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  // What gets sent to /api/chat: MATCH lines removed, and the oldest turns dropped when the
  // conversation would exceed the size limit. The first message (the trip description) is always kept.
  function buildHistory() {
    var list = state.messages.map(function (m) {
      var content = m.role === "assistant" ? (splitReply(m.content).text || "Here are your options.") : m.content;
      return { role: m.role, content: content.slice(0, m.role === "assistant" ? ASSISTANT_MAX : 4000) };
    });
    function size(arr) { return new Blob([JSON.stringify({ messages: arr })]).size; }
    if (list.length <= HISTORY_MAX && size(list) <= HISTORY_BYTES) return list;
    var first = list[0];
    var tail = [];
    for (var i = list.length - 1; i >= 1; i--) {
      var next = [list[i]].concat(tail);
      if (next.length + 1 > HISTORY_MAX || size([first].concat(next)) > HISTORY_BYTES) break;
      tail = next;
    }
    while (tail.length && tail[0].role !== "assistant") tail.shift();
    if (!tail.length) return [list[list.length - 1]];
    return [first].concat(tail);
  }

  function renderLog() {
    Array.prototype.slice.call(el.log.querySelectorAll(".msg")).forEach(function (n) { n.remove(); });
    el.empty.hidden = state.messages.length > 0;
    state.messages.forEach(function (m) {
      addBubble(m.role, m.role === "assistant" ? splitReply(m.content).text || "Here are your options." : m.content);
    });
    updateCount();
    scrollLog();
  }

  function scrollLog() { el.log.scrollTop = el.log.scrollHeight; }

  function updateCount() {
    var n = state.messages.length;
    el.count.textContent = n === 0 ? "No messages yet" : n === 1 ? "1 message" : n + " messages";
    el.download.disabled = !state.messages.some(function (m) { return m.role === "assistant"; });
  }

  function selectedMatch() {
    if (!state.matches.length) return null;
    for (var i = 0; i < state.matches.length; i++) if (state.matches[i].id === state.selected) return state.matches[i];
    return state.matches[0];
  }

  function renderSide() {
    var top = state.matches[0];
    if (top) {
      el.topKind.textContent = top.details.Type || "Trip option";
      el.topTitle.textContent = top.title;
      el.topScore.textContent = top.score + "/100";
      el.topWhy.textContent = top.why || "This option fits your trip best so far.";
      el.gaugeNum.textContent = top.score + "/100";
      el.gaugeFill.setAttribute("stroke-dasharray", (CIRC * top.score / 100).toFixed(2) + " " + CIRC.toFixed(2));
      el.rankNote.textContent = state.matches.length === 1 ? "One option so far. Ask for alternatives anytime." : state.matches.length + " options, best fit first. Tap one for details.";
    } else {
      el.topKind.textContent = "Trip option";
      el.topTitle.textContent = "Waiting for your first question";
      el.topScore.textContent = "—";
      el.topWhy.textContent = "Your best option will appear here once the planner has enough to go on.";
      el.gaugeNum.textContent = "—";
      el.gaugeFill.setAttribute("stroke-dasharray", "0 " + CIRC.toFixed(2));
      el.rankNote.textContent = "Options are ranked by how well they fit your trip.";
    }

    while (el.shortList.firstChild) el.shortList.removeChild(el.shortList.firstChild);
    var sel = selectedMatch();
    state.matches.forEach(function (m) {
      var li = document.createElement("li");
      var b = document.createElement("button");
      b.type = "button";
      b.setAttribute("aria-pressed", sel && sel.id === m.id ? "true" : "false");
      var t = document.createElement("span"); t.className = "s-title"; t.textContent = m.title;
      var s = document.createElement("span"); s.className = "s-score"; s.textContent = String(m.score);
      b.appendChild(t); b.appendChild(s);
      b.setAttribute("aria-label", m.title + ", fit score " + m.score + " out of 100");
      b.addEventListener("click", function () { state.selected = m.id; save(); renderSide(); });
      li.appendChild(b);
      el.shortList.appendChild(li);
    });

    while (el.detailsList.firstChild) el.detailsList.removeChild(el.detailsList.firstChild);
    if (sel) {
      el.detailsName.textContent = sel.title;
      el.detailsName.classList.add("has-match");
      Object.keys(sel.details).forEach(function (k) {
        if (HIDDEN_DETAIL_KEYS.indexOf(k) !== -1) return;
        var wrap = document.createElement("div");
        var dt = document.createElement("dt"); dt.textContent = k;
        var dd = document.createElement("dd"); dd.textContent = sel.details[k];
        wrap.appendChild(dt); wrap.appendChild(dd);
        el.detailsList.appendChild(wrap);
      });
      var g = sel.details.Guide;
      el.guideLink.href = g && /^[a-z0-9-]{1,60}$/.test(g) ? "/guide#" + g : "/guide";
      el.nextText.textContent = sel.details["Next step"] || "Compare this option's total price, with bags, on the airline's own site.";
    } else {
      el.detailsName.textContent = "Pick an option from the shortlist to see its details.";
      el.detailsName.classList.remove("has-match");
      el.guideLink.href = "/guide";
      el.nextText.textContent = "Describe your trip in the chat to get a concrete next step.";
    }
  }

  // ---------- Sending ----------
  function autoGrow() {
    el.msg.style.height = "auto";
    el.msg.style.height = (el.msg.scrollHeight + 2) + "px";
    // Allow scrolling only when the text is longer than the box can show (max-height reached).
    el.msg.style.overflowY = el.msg.scrollHeight > el.msg.clientHeight + 1 ? "auto" : "hidden";
  }

  function setBusy(on) {
    busy = on;
    el.send.disabled = on;
    el.send.setAttribute("aria-busy", on ? "true" : "false");
  }

  function send() {
    if (busy) return;
    var text = el.msg.value.trim();
    if (!text) { el.msg.focus(); return; }
    if (text.length > 4000) text = text.slice(0, 4000);
    stopListening();
    clearMicMsg();
    Array.prototype.slice.call(el.log.querySelectorAll(".msg.error")).forEach(function (n) { n.remove(); });

    state.messages.push({ role: "user", content: text });
    save();
    el.msg.value = "";
    autoGrow();
    el.empty.hidden = true;
    addBubble("user", text);
    updateCount();
    var pending = addThinking();
    scrollLog();
    setBusy(true);

    var history = buildHistory();

    fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history })
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (data) { return { ok: res.ok, status: res.status, data: data }; });
    }).then(function (r) {
      pending.remove();
      if (!r.ok || !r.data || typeof r.data.reply !== "string") {
        throw new Error(r.data && typeof r.data.error === "string" ? r.data.error : "The planner couldn't answer just now. Try again in a moment.");
      }
      state.messages.push({ role: "assistant", content: r.data.reply.slice(0, ASSISTANT_MAX) });
      var parts = splitReply(r.data.reply);
      if (parts.matches.length) {
        state.matches = parts.matches;
        state.selected = parts.matches[0].id;
      }
      save();
      addBubble("assistant", parts.text || "Here are your options.");
      updateCount();
      renderSide();
      scrollLog();
    }).catch(function (err) {
      pending.remove();
      // Put the message back so it can be retried.
      var last = state.messages[state.messages.length - 1];
      if (last && last.role === "user" && last.content === text) {
        state.messages.pop();
        save();
        var bubbles = el.log.querySelectorAll(".msg.user");
        if (bubbles.length) bubbles[bubbles.length - 1].remove();
        el.msg.value = text;
        autoGrow();
      }
      updateCount();
      el.empty.hidden = state.messages.length > 0;
      var msg = err && err.message && err.message !== "Failed to fetch" ? err.message : "Couldn't reach the planner. Check your connection and try again.";
      addBubble("assistant", msg, "error");
      scrollLog();
    }).then(function () { setBusy(false); });
  }

  el.send.addEventListener("click", send);
  el.download.addEventListener("click", downloadPlan);
  el.msg.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(); }
  });
  el.msg.addEventListener("input", autoGrow);

  el.reset.addEventListener("click", function () {
    if (busy) return;
    state = { messages: [], matches: [], selected: null };
    save();
    stopListening();
    clearMicMsg();
    Array.prototype.slice.call(el.log.querySelectorAll(".msg")).forEach(function (n) { n.remove(); });
    renderLog();
    renderSide();
    el.msg.value = "";
    autoGrow();
    el.msg.focus();
  });

  // ---------- Full page ----------
  function setFull(on) {
    if (on) {
      el.slot.style.height = el.card.getBoundingClientRect().height + "px";
      el.card.classList.add("is-full");
      document.body.classList.add("chat-full");
      el.full.setAttribute("aria-pressed", "true");
      el.full.textContent = "Exit full page";
      el.msg.focus();
    } else {
      el.card.classList.remove("is-full");
      document.body.classList.remove("chat-full");
      el.slot.style.height = "";
      el.full.setAttribute("aria-pressed", "false");
      el.full.textContent = "Full page";
      el.full.focus();
    }
    scrollLog();
  }
  el.full.addEventListener("click", function () { setFull(!el.card.classList.contains("is-full")); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && el.card.classList.contains("is-full")) setFull(false);
  });

  // ---------- Voice input ----------
  // Keeps listening through pauses and turns off after SILENCE_MS without speech,
  // or when the mic button is tapped again. Speech fills the box; it never sends.
  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var IS_ANDROID = /Android/i.test(navigator.userAgent);
  var rec = null;
  var listening = false;
  var wantOn = false;
  var base = "";
  var committed = "";
  var sessionFinal = "";
  var lastHeard = 0;
  var silenceTimer = null;

  function clearMicMsg() { el.micMsg.hidden = true; el.micMsg.textContent = ""; el.micMsg.classList.remove("info"); }
  function showMicMsg(text) { el.micMsg.textContent = text; el.micMsg.classList.remove("info"); el.micMsg.hidden = false; }
  function showMicInfo(text) { el.micMsg.textContent = text; el.micMsg.classList.add("info"); el.micMsg.hidden = false; }

  function setListening(on) {
    listening = on;
    el.mic.setAttribute("aria-pressed", on ? "true" : "false");
    el.mic.setAttribute("aria-label", on ? "Stop voice input" : "Speak instead of typing");
    el.mic.title = on ? "Stop voice input" : "Speak instead of typing";
  }

  function joinText() {
    return (base + committed + sessionFinal).replace(/\s+/g, " ").replace(/^ /, "");
  }

  function finish() {
    wantOn = false;
    clearInterval(silenceTimer);
    silenceTimer = null;
    setListening(false);
    if (!el.micMsg.classList.contains("info")) return;
    clearMicMsg();
    el.msg.focus();
  }

  function stopListening() {
    if (!wantOn && !listening) return;
    wantOn = false;
    if (rec) { try { rec.stop(); } catch (e) { /* ignore */ } }
    finish();
  }

  function startSession() {
    sessionFinal = "";
    rec = new SR();
    rec.lang = document.documentElement.lang || "en-US";
    rec.interimResults = true;
    // Android's recognizer repeats words in continuous mode, so it restarts after each phrase instead.
    rec.continuous = !IS_ANDROID;
    rec.onresult = function (e) {
      lastHeard = Date.now();
      var fin = "", interim = "";
      for (var i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) fin += e.results[i][0].transcript + " ";
        else interim += e.results[i][0].transcript;
      }
      sessionFinal = fin;
      el.msg.value = (joinText() + interim).slice(0, 4000);
      autoGrow();
    };
    rec.onspeechstart = function () { lastHeard = Date.now(); };
    rec.onerror = function (e) {
      var code = e && e.error;
      if (code === "no-speech" || code === "aborted") return; // silence is handled by the 10-second timer
      wantOn = false;
      if (code === "not-allowed" || code === "service-not-allowed") showMicMsg("The microphone is blocked. Allow it in your browser's site settings to talk instead of type.");
      else if (code === "audio-capture") showMicMsg("No microphone was found. Check that one is connected.");
      else if (code === "network") showMicMsg("Voice input needs an internet connection. Try again or type instead.");
      else showMicMsg("Voice input stopped. Try again or type instead.");
    };
    rec.onend = function () {
      committed += sessionFinal;
      sessionFinal = "";
      el.msg.value = joinText().slice(0, 4000);
      autoGrow();
      // The browser ends a session on its own after a pause; keep going until 10 seconds of silence.
      if (wantOn && Date.now() - lastHeard < SILENCE_MS) {
        try { startSession(); return; } catch (err) { /* fall through */ }
      }
      finish();
    };
    rec.start();
  }

  if (!SR) {
    el.mic.hidden = true;
  } else {
    el.mic.addEventListener("click", function () {
      if (listening || wantOn) { stopListening(); return; }
      clearMicMsg();
      base = el.msg.value ? el.msg.value.replace(/\s+$/, "") + " " : "";
      committed = "";
      sessionFinal = "";
      lastHeard = Date.now();
      wantOn = true;
      try {
        startSession();
        setListening(true);
        showMicInfo("Listening. Take your time; the mic turns off after 10 seconds of silence.");
        silenceTimer = setInterval(function () {
          if (wantOn && Date.now() - lastHeard >= SILENCE_MS) stopListening();
        }, 500);
      } catch (e) {
        wantOn = false;
        showMicMsg("Voice input couldn't start. Try again or type instead.");
      }
    });
  }

  // ---------- Start ----------
  renderLog();
  renderSide();
  autoGrow();
})();
