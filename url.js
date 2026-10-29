// Pestaña «Desde enlaces»: descarga archivos por URL directa, extrae su audio o los envía a las otras pestañas.
// Usa globales de app.js ($, fmtSize, setStatus, save, makeZip, nameFromUrl, addBlob, renderGrid, showTab, srcTab).
(() => {
  "use strict";

  const log = $("urlLog");
  let busy = false;

  const EXT_BY_MIME = {
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov", "video/ogg": "ogv",
    "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav", "audio/x-wav": "wav",
    "audio/ogg": "ogg", "audio/webm": "weba", "audio/flac": "flac",
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg",
  };
  const baseName = (n) => n.replace(/\.[^.]+$/, "") || "archivo";
  const cleanName = (n) => n.replace(/[\\/:*?"<>|]+/g, "_").trim() || "archivo";

  function line(cls, text) {
    const d = document.createElement("div");
    d.className = cls;
    d.textContent = text;
    log.append(d);
    return d;
  }
  function setLine(d, cls, text) {
    d.className = cls;
    d.textContent = text;
  }

  function parseUrls() {
    const seen = new Set();
    const out = [];
    for (const raw of $("urls").value.split(/\r?\n/)) {
      const s = raw.trim();
      if (!s) continue;
      let u;
      try { u = new URL(s); } catch { out.push({ bad: s }); continue; }
      if (!/^https?:$/.test(u.protocol)) { out.push({ bad: s }); continue; }
      if (seen.has(u.href)) continue;
      seen.add(u.href);
      out.push({ url: u.href });
    }
    return out;
  }

  function dispositionName(h) {
    if (!h) return null;
    let m = /filename\*=(?:UTF-8'')?([^;]+)/i.exec(h);
    if (m) {
      try { return decodeURIComponent(m[1].trim().replace(/^"|"$/g, "")); } catch {}
    }
    m = /filename="?([^";]+)"?/i.exec(h);
    return m ? m[1].trim() : null;
  }

  async function fetchFile(u, i, onProgress) {
    const r = await fetch(u, { credentials: "include" });
    if (!r.ok) throw new Error(`el servidor respondió ${r.status}`);
    const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    if (type === "text/html" || type === "application/xhtml+xml") {
      throw new Error("es una página web, no un archivo (los enlaces de YouTube, TikTok, Vimeo… no valen)");
    }
    if (/mpegurl|dash\+xml/.test(type) || /\.(m3u8|mpd)(\?|$)/i.test(u)) {
      throw new Error("es una emisión por streaming (HLS/DASH), no un archivo");
    }
    const total = Number(r.headers.get("content-length")) || 0;
    const reader = r.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      onProgress(got, total);
    }
    const blob = new Blob(chunks, { type: type || "application/octet-stream" });
    let name = cleanName(dispositionName(r.headers.get("content-disposition")) || nameFromUrl(u, i));
    if (!/\.[a-z0-9]{2,5}$/i.test(name) && EXT_BY_MIME[type]) name += "." + EXT_BY_MIME[type];
    return { blob, name };
  }

  function saveMany(files, zipName) {
    if (files.length === 1) return save(files[0].blob, files[0].name);
    const used = new Set();
    return Promise.all(
      files.map(async (f) => {
        let name = f.name;
        const dot = name.lastIndexOf(".");
        const base = dot > 0 ? name.slice(0, dot) : name;
        const ext = dot > 0 ? name.slice(dot) : "";
        let k = 2;
        while (used.has(name.toLowerCase())) name = `${base}-${k++}${ext}`;
        used.add(name.toLowerCase());
        return { name, data: new Uint8Array(await f.blob.arrayBuffer()) };
      })
    ).then((zf) => save(makeZip(zf), zipName));
  }

  async function runUrls() {
    if (busy) return;
    const entries = parseUrls();
    if (!entries.length) return setStatus("Pega al menos un enlace.");
    const act = $("urlAction").value;
    busy = true;
    $("urlGo").disabled = true;
    log.replaceChildren();

    const done = [];
    let loadedAV = 0, loadedImg = 0, failed = 0, idx = 0;
    for (const e of entries) {
      idx++;
      if (e.bad) {
        line("bad", `✘ ${e.bad} — no es un enlace http(s) válido`);
        failed++;
        continue;
      }
      const ln = line("wait", `… ${e.url}`);
      try {
        const f = await fetchFile(e.url, idx, (got, total) =>
          setLine(ln, "wait", `… ${total ? Math.round((got / total) * 100) + " %" : fmtSize(got)} · ${e.url}`)
        );
        if (act === "save") {
          done.push(f);
          setLine(ln, "ok", `✔ ${f.name} · ${fmtSize(f.blob.size)}`);
        } else if (act === "mp3") {
          if (f.blob.size > 300 * 1024 * 1024) throw new Error("el archivo es demasiado grande para convertirlo aquí");
          const r = await Kit.extractAudio(f.blob, "mp3", { rate: 44100, mono: false, kbps: 192 }, (t) =>
            setLine(ln, "wait", `… ${f.name}: ${t}`)
          );
          const out = `${baseName(f.name)}.mp3`;
          done.push({ blob: r.blob, name: out });
          setLine(ln, "ok", `✔ ${out} · ${fmtSize(r.blob.size)}`);
        } else if (f.blob.type.startsWith("image/")) {
          if (!(await addBlob(f.blob, f.name))) throw new Error("no se pudo leer como imagen");
          loadedImg++;
          setLine(ln, "ok", `✔ ${f.name} cargado en «Imágenes»`);
        } else {
          if (!(await Kit.addMedia(f.blob, f.name))) throw new Error("no es audio ni vídeo, o Chrome no puede reproducirlo");
          loadedAV++;
          setLine(ln, "ok", `✔ ${f.name} cargado en «Audio y vídeo»`);
        }
      } catch (err) {
        failed++;
        setLine(ln, "bad", `✘ ${e.url} — ${err && err.message ? err.message : err}`);
      }
    }

    if (done.length) await saveMany(done, act === "mp3" ? "audios-mp3.zip" : "descargas.zip");
    if (loadedAV) Kit.render();
    if (loadedImg) renderGrid();
    if (loadedAV && !loadedImg) showTab("av");
    else if (loadedImg && !loadedAV) showTab("img");

    const okCount = done.length + loadedAV + loadedImg;
    setStatus(`${okCount} correctos` + (failed ? `, ${failed} con error.` : "."));
    busy = false;
    $("urlGo").disabled = false;
  }

  async function scanTab() {
    if (srcTab == null || Number.isNaN(srcTab)) {
      return setStatus("Abre la extensión desde la web donde están los vídeos o audios.");
    }
    setStatus("Buscando vídeos y audios en la página…");
    let res;
    try {
      const [{ result }] = await chrome.scripting.executeScript({
        target: { tabId: srcTab },
        func: () => {
          const out = new Set();
          let blobs = 0;
          const add = (u) => {
            if (!u) return;
            if (u.startsWith("blob:") || u.startsWith("mediastream:")) { blobs++; return; }
            if (u.startsWith("data:")) return;
            try { out.add(new URL(u, location.href).href); } catch {}
          };
          document.querySelectorAll("video, audio").forEach((m) => {
            add(m.currentSrc || m.src);
            m.querySelectorAll("source").forEach((s) => add(s.src));
          });
          document.querySelectorAll("a[href]").forEach((a) => {
            if (/\.(mp4|m4v|mov|webm|mp3|m4a|wav|ogg|oga|opus|flac|aac)(\?|#|$)/i.test(a.href)) add(a.href);
          });
          document
            .querySelectorAll('meta[property="og:video"],meta[property="og:video:url"],meta[property="og:audio"]')
            .forEach((m) => add(m.content));
          return { urls: [...out], blobs };
        },
      });
      res = result;
    } catch {
      return setStatus("No puedo leer esa pestaña (¿es una página interna de Chrome o ya está cerrada?).");
    }

    const ta = $("urls");
    const have = new Set(ta.value.split(/\r?\n/).map((s) => s.trim()));
    const fresh = res.urls.filter((u) => !have.has(u));
    if (fresh.length) ta.value = (ta.value.trim() ? ta.value.trim() + "\n" : "") + fresh.join("\n");
    log.replaceChildren();
    line(fresh.length ? "ok" : "wait", `${fresh.length} enlace(s) nuevo(s) encontrados en la página.`);
    if (res.blobs) {
      line("bad", `${res.blobs} vídeo(s) usan streaming (blob:) y no se pueden descargar desde un enlace.`);
    }
    setStatus("Revisa la lista de enlaces y pulsa «Ejecutar».");
  }

  $("urlGo").onclick = runUrls;
  $("urlScan").onclick = scanTab;
  $("urlClear").onclick = () => { $("urls").value = ""; log.replaceChildren(); };

  if (srcTab != null && !Number.isNaN(srcTab) && chrome.tabs) {
    chrome.tabs.get(srcTab).then(
      (t) => { const o = t.title || t.url; $("urlSrc").textContent = o ? `Web de origen: ${o}` : ""; },      () => {}
    );
  }
})();
