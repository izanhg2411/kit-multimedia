// Pestaña «Audio y vídeo»: audio → MP3/WAV, vídeo → GIF, fotogramas y recodificado.
// Usa globales de app.js ($, el, fmtSize, setStatus, save, MIME, EXT) y de codecs.js.
(() => {
  "use strict";

  const list = []; // { id, name, blob, url, kind, duration, w, h, selected, results[], status, err }
  let nid = 1;
  let busy = false;

  const VIDEO_EXT = /\.(mp4|m4v|mov|webm|ogv|mkv|avi)$/i;
  const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|weba)$/i;
  const baseName = (n) => n.replace(/\.[^.]+$/, "") || "archivo";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const num = (id, def = 0) => {
    const v = parseFloat($(id).value);
    return Number.isFinite(v) ? v : def;
  };
  const fmtTime = (s) => {
    s = Math.round(s || 0);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const once = (target, ev, ms) =>
    new Promise((res) => {
      let t;
      const f = () => { clearTimeout(t); target.removeEventListener(ev, f); res(); };
      target.addEventListener(ev, f);
      if (ms) t = setTimeout(f, ms);
    });

  // ---------- Carga ----------
  function kindOf(blob, name) {
    if (blob.type.startsWith("video/")) return "video";
    if (blob.type.startsWith("audio/")) return "audio";
    if (VIDEO_EXT.test(name)) return "video";
    if (AUDIO_EXT.test(name)) return "audio";
    return null;
  }

  function loadMeta(url, kind) {
    return new Promise((resolve, reject) => {
      const m = document.createElement(kind === "video" ? "video" : "audio");
      m.preload = "metadata";
      m.muted = true;
      const t = setTimeout(() => reject(new Error("tiempo agotado")), 10000);
      m.onloadedmetadata = async () => {
        clearTimeout(t);
        try {
          if (!Number.isFinite(m.duration)) {
            // WebM grabado por el navegador: la cabecera no trae la duración
            m.currentTime = 1e101;
            await once(m, "timeupdate", 3000);
          }
          resolve({
            duration: Number.isFinite(m.duration) ? m.duration : 0,
            w: m.videoWidth || 0,
            h: m.videoHeight || 0,
          });
        } catch (e) {
          reject(e);
        }
      };
      m.onerror = () => { clearTimeout(t); reject(new Error("formato no compatible")); };
      m.src = url;
    });
  }

  async function addMedia(blob, name) {
    let kind = kindOf(blob, name);
    if (!kind) return false;
    const url = URL.createObjectURL(blob);
    try {
      const meta = await loadMeta(url, kind);
      if (kind === "video" && !meta.w) kind = "audio"; // mp4 solo con sonido
      list.push({
        id: nid++, name, blob, url, kind, duration: meta.duration, w: meta.w, h: meta.h,
        selected: true, results: [], status: "", err: false,
      });
      return true;
    } catch {
      URL.revokeObjectURL(url);
      return false;
    }
  }

  async function addFiles(fileList) {
    let ok = 0, bad = 0;
    for (const f of fileList) {
      setStatus(`Leyendo ${f.name}…`);
      (await addMedia(f, f.name || "archivo")) ? ok++ : bad++;
    }
    render();
    setStatus(`${ok} archivo(s) añadidos` + (bad ? `, ${bad} no compatibles con Chrome.` : "."));
  }

  // ---------- Lista ----------
  function clearResults(m) {
    m.results.forEach((r) => URL.revokeObjectURL(r.url));
    m.results = [];
    m.status = "";
    m.err = false;
  }

  function removeMedia(m) {
    clearResults(m);
    URL.revokeObjectURL(m.url);
    list.splice(list.indexOf(m), 1);
  }

  function updateCount() {
    const s = list.filter((m) => m.selected).length;
    $("avCount").textContent = list.length ? `${s} de ${list.length} seleccionados` : "";
  }

  function setRowStatus(m, text, isErr) {
    m.status = text;
    m.err = !!isErr;
    const e = document.getElementById("avst-" + m.id);
    if (e) {
      e.textContent = text;
      e.classList.toggle("err", !!isErr);
    }
  }

  function resultBlock(r) {
    const d = el("avres");
    const type = r.blob.type;
    if (type.startsWith("image/")) {
      const i = document.createElement("img");
      i.src = r.url;
      i.alt = "";
      d.append(i);
    } else if (type.startsWith("audio/")) {
      const a = document.createElement("audio");
      a.src = r.url;
      a.controls = true;
      d.append(a);
    } else if (type.startsWith("video/")) {
      const v = document.createElement("video");
      v.src = r.url;
      v.controls = true;
      v.preload = "metadata";
      d.append(v);
    }
    const t = el("t");
    const b = document.createElement("b");
    b.textContent = r.name;
    const s = document.createElement("span");
    s.textContent = fmtSize(r.blob.size) + (r.note ? " · " + r.note : "");
    t.append(b, s);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "Descargar";
    btn.onclick = () => save(r.blob, r.name);
    d.append(t, btn);
    return d;
  }

  function render() {
    const box = $("avList");
    box.replaceChildren();
    if (!list.length) {
      const e = document.createElement("div");
      e.className = "empty";
      e.textContent = "Todavía no hay vídeos ni audios.";
      box.append(e);
    }
    for (const m of list) {
      const row = el("avrow" + (m.selected ? " sel" : ""));
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = m.selected;
      cb.onchange = () => {
        m.selected = cb.checked;
        row.classList.toggle("sel", m.selected);
        updateCount();
      };

      const prev = el("prev");
      const media = document.createElement(m.kind === "video" ? "video" : "audio");
      media.src = m.url;
      media.controls = true;
      media.preload = "metadata";
      prev.append(media);

      const body = el("body");
      const nm = el("name");
      nm.textContent = m.name;
      const info = el("info");
      info.textContent =
        `${m.kind === "video" ? "Vídeo" : "Audio"} · ${fmtTime(m.duration)}` +
        (m.kind === "video" ? ` · ${m.w}×${m.h}` : "") + ` · ${fmtSize(m.blob.size)}`;
      const st = el("st" + (m.err ? " err" : ""));
      st.id = "avst-" + m.id;
      st.textContent = m.status || "";
      body.append(nm, info, st);
      for (const r of m.results) body.append(resultBlock(r));

      const x = document.createElement("button");
      x.className = "x";
      x.type = "button";
      x.textContent = "✕";
      x.title = "Quitar";
      x.onclick = () => { removeMedia(m); render(); };

      row.append(cb, prev, body, x);
      box.append(row);
    }
    updateCount();
  }

  // ---------- Utilidades de vídeo ----------
  function openVideo(url) {
    return new Promise((resolve, reject) => {
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.preload = "auto";
      v.onloadeddata = () => resolve(v);
      v.onerror = () => reject(new Error("no se pudo abrir el vídeo"));
      v.src = url;
    });
  }

  function closeVideo(v) {
    try { v.pause(); } catch {}
    v.removeAttribute("src");
    v.load();
  }

  function seekTo(v, t) {
    return new Promise((resolve) => {
      const target = Math.max(0, Math.min(t, (v.duration || t) - 0.001));
      if (Math.abs(v.currentTime - target) < 0.001) return resolve();
      const done = () => { clearTimeout(tm); v.removeEventListener("seeked", done); resolve(); };
      const tm = setTimeout(done, 5000);
      v.addEventListener("seeked", done);
      v.currentTime = target;
    });
  }

  function addResult(m, blob, name, note) {
    m.results.push({ blob, name, url: URL.createObjectURL(blob), note });
  }

  // ---------- Audio → MP3 / WAV ----------
  async function decodeAudioBlob(blob, rate) {
    const ab = await blob.arrayBuffer();
    const ctx = new OfflineAudioContext(2, 1, rate);
    try {
      return await ctx.decodeAudioData(ab);
    } catch {
      throw new Error("no se pudo leer el audio (el archivo no tiene sonido o su códec no es compatible con Chrome)");
    }
  }

  // o: { rate, mono, kbps }
  async function extractAudio(blob, type, o, onStatus) {
    onStatus("Leyendo audio…");
    const abuf = await decodeAudioBlob(blob, o.rate);
    const chans = [];
    for (let c = 0; c < abuf.numberOfChannels; c++) chans.push(abuf.getChannelData(c));
    const mixed = mixChannels(chans, o.mono);
    const mono = mixed.length === 1 ? " · mono" : "";
    if (type === "wav") {
      return { blob: encodeWav(mixed, abuf.sampleRate), ext: "wav", note: `${abuf.sampleRate / 1000} kHz${mono}` };
    }
    const out = await encodeMp3(mixed, abuf.sampleRate, o.kbps, (p) => onStatus(`Codificando MP3… ${Math.round(p * 100)}%`));
    return { blob: out, ext: "mp3", note: `${o.kbps} kbps${mono}` };
  }

  async function doAudio(m, type) {
    if (m.duration > 3000) {
      throw new Error("es demasiado largo (más de 50 min) para hacerlo dentro del navegador sin quedarse sin memoria");
    }
    const r = await extractAudio(
      m.blob, type,
      { rate: num("avRate", 44100), mono: $("avMono").checked, kbps: num("avKbps", 192) },
      (t) => setRowStatus(m, t)
    );
    addResult(m, r.blob, `${baseName(m.name)}.${r.ext}`, r.note);
  }

  // ---------- Vídeo → GIF ----------
  async function doGif(m) {
    const start = clamp(num("gifStart"), 0, Math.max(0, m.duration - 0.1));
    const dur = Math.min(num("gifDur", 5) || 5, m.duration - start);
    const fps = clamp(Math.round(num("gifFps", 10)), 1, 30);
    const w = Math.min(Math.max(64, Math.round(num("gifWidth", 480))), m.w);
    const h = Math.round((m.h * w) / m.w);
    const n = Math.max(1, Math.round(dur * fps));
    if (n > 400) throw new Error(`saldrían ${n} fotogramas y el máximo es 400: reduce la duración o los fps`);

    const v = await openVideo(m.url);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const gif = gifBegin();
    try {
      for (let i = 0; i < n; i++) {
        await seekTo(v, start + i / fps);
        ctx.drawImage(v, 0, 0, w, h);
        gifAddFrame(gif, ctx.getImageData(0, 0, w, h).data, w, h, Math.round(1000 / fps));
        setRowStatus(m, `Creando GIF… ${i + 1}/${n}`);
        if (i % 2 === 1) await yieldUI();
      }
    } finally {
      closeVideo(v);
    }
    addResult(m, gifEnd(gif), `${baseName(m.name)}.gif`, `${w}×${h} · ${fps} fps · ${n} fotogramas`);
  }

  // ---------- Vídeo → fotogramas ----------
  async function doFrames(m) {
    const t0 = clamp(num("frTime"), 0, Math.max(0, m.duration - 0.05));
    const every = Math.max(0, num("frEvery"));
    const times = [];
    if (every > 0) for (let t = t0; t < m.duration - 0.05; t += every) times.push(t);
    else times.push(t0);
    if (times.length > 300) throw new Error(`saldrían ${times.length} imágenes y el máximo es 300`);

    const fmt = $("frFormat").value;
    const wReq = Math.round(num("frWidth"));
    const w = wReq > 0 ? Math.min(wReq, m.w) : m.w;
    const h = Math.round((m.h * w) / m.w);
    const v = await openVideo(m.url);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    try {
      for (let i = 0; i < times.length; i++) {
        await seekTo(v, times[i]);
        ctx.drawImage(v, 0, 0, w, h);
        const blob = await new Promise((r) => canvas.toBlob(r, MIME[fmt], 0.92));
        addResult(m, blob, `${baseName(m.name)}_${times[i].toFixed(1)}s.${EXT[fmt]}`, `${w}×${h}`);
        setRowStatus(m, `Sacando fotogramas… ${i + 1}/${times.length}`);
      }
    } finally {
      closeVideo(v);
    }
  }

  // ---------- Vídeo → recodificar (comprimir / recortar / cambiar formato) ----------
  const MIMES = {
    mp4: ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4;codecs=avc1,mp4a.40.2", "video/mp4"],
    mp4v: ["video/mp4;codecs=avc1.42E01E", "video/mp4;codecs=avc1", "video/mp4"],
    webm: ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"],
    webmv: ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"],
  };

  function pickMime(kind, withAudio) {
    if (!window.MediaRecorder) return null;
    for (const mm of MIMES[kind + (withAudio ? "" : "v")]) if (MediaRecorder.isTypeSupported(mm)) return mm;
    return null;
  }

  async function doRecode(m) {
    if (!window.MediaRecorder) throw new Error("este Chrome no puede grabar vídeo");
    const mute = $("rcMute").checked;
    let kind = $("rcFormat").value;

    const start = clamp(num("rcStart"), 0, Math.max(0, m.duration - 0.2));
    const endIn = num("rcEnd");
    const end = endIn > 0 ? Math.min(endIn, m.duration) : m.duration;
    if (end - start < 0.2) throw new Error("el tramo a recortar es demasiado corto");
    const kbps = clamp(Math.round(num("rcKbps", 2500)), 100, 40000);
    let w = Math.round(num("rcWidth"));
    w = w > 0 ? Math.min(w, m.w) : m.w;
    w -= w % 2;
    let h = Math.round((m.h * w) / m.w);
    h -= h % 2;

    const v = await openVideo(m.url);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    const stream = canvas.captureStream();
    let ac = null;
    let hasAudio = false;
    try {
      if (!mute) {
        // El sonido se lleva al grabador por Web Audio: así no suena por los altavoces mientras se procesa.
        try {
          ac = new AudioContext();
          const node = ac.createMediaElementSource(v);
          const dest = ac.createMediaStreamDestination();
          node.connect(dest);
          v.muted = false;
          dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
          await ac.resume();
          hasAudio = true;
        } catch {
          v.muted = true;
        }
      }

      let note = "";
      let mime = pickMime(kind, hasAudio);
      if (!mime && kind === "mp4") {
        kind = "webm";
        mime = pickMime("webm", hasAudio);
        note = "Tu Chrome no graba MP4, se ha guardado en WebM · ";
      }
      if (!mime) throw new Error("tu Chrome no puede grabar en ese formato");

      const rec = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: kbps * 1000,
        audioBitsPerSecond: 128000,
      });
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => (rec.onstop = res));

      await seekTo(v, start);
      ctx.drawImage(v, 0, 0, w, h);
      rec.start(1000);
      try {
        await v.play();
      } catch {
        rec.stop();
        throw new Error("Chrome bloqueó la reproducción automática. Pulsa «Procesar» otra vez");
      }

      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        v.pause();
        try { rec.stop(); } catch {}
      };
      v.addEventListener("ended", finish);
      const watchdog = setInterval(() => { if (v.currentTime >= end - 0.02) finish(); }, 200);
      const tick = () => {
        if (finished) return;
        ctx.drawImage(v, 0, 0, w, h);
        const p = clamp((v.currentTime - start) / (end - start), 0, 1);
        setRowStatus(m, `Recodificando… ${Math.round(p * 100)} % (a velocidad real, mantén esta pestaña visible)`);
        if (v.currentTime >= end - 0.02) return finish();
        if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick);
        else requestAnimationFrame(tick);
      };
      tick();
      await stopped;
      clearInterval(watchdog);

      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      addResult(
        m, blob, `${baseName(m.name)}-recodificado.${kind}`,
        `${note}${w}×${h} · ${kbps} kbps${hasAudio ? "" : " · sin sonido"} · ${fmtTime(end - start)}`
      );
    } finally {
      stream.getTracks().forEach((t) => t.stop());
      if (ac) ac.close().catch(() => {});
      closeVideo(v);
    }
  }

  // ---------- Ejecutar / descargar ----------
  async function runAV() {
    if (busy) return;
    const act = $("avAction").value;
    const sel = list.filter((m) => m.selected);
    if (!sel.length) return setStatus("Selecciona al menos un archivo.");
    busy = true;
    $("avGo").disabled = true;
    $("avDl").disabled = true;
    sel.forEach(clearResults);
    render();

    let ok = 0, failed = 0, n = 0;
    for (const m of sel) {
      setStatus(`Procesando ${++n}/${sel.length}…`);
      try {
        if (act === "mp3" || act === "wav") await doAudio(m, act);
        else if (m.kind !== "video") throw new Error("esta opción solo vale para vídeos");
        else if (act === "gif") await doGif(m);
        else if (act === "frames") await doFrames(m);
        else if (act === "recode") await doRecode(m);
        setRowStatus(m, "Listo ✔");
        ok++;
      } catch (e) {
        console.error(e);
        setRowStatus(m, "Error: " + (e && e.message ? e.message : e), true);
        failed++;
      }
    }
    render();
    setStatus(`Terminado: ${ok} correctos` + (failed ? `, ${failed} con error.` : ". Descarga cada resultado o todo en ZIP."));
    busy = false;
    $("avGo").disabled = false;
    $("avDl").disabled = false;
  }

  async function downloadAll() {
    const all = list.flatMap((m) => m.results);
    if (!all.length) return setStatus("Todavía no hay resultados que descargar.");
    if (all.length === 1) return save(all[0].blob, all[0].name);
    const used = new Set();
    const files = [];
    for (const r of all) {
      let name = r.name;
      const dot = name.lastIndexOf(".");
      const base = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      let k = 2;
      while (used.has(name.toLowerCase())) name = `${base}-${k++}${ext}`;
      used.add(name.toLowerCase());
      files.push({ name, data: new Uint8Array(await r.blob.arrayBuffer()) });
    }
    save(makeZip(files), "resultados.zip");
  }

  // ---------- Eventos ----------
  function syncPanels() {
    const act = $("avAction").value;
    document.querySelectorAll("#tab-av [data-for]").forEach((e) => {
      e.hidden = !e.dataset.for.split(" ").includes(act);
    });
  }
  $("avAction").onchange = syncPanels;
  syncPanels();

  if (!pickMime("mp4", true)) {
    const opt = $("rcFormat").querySelector('option[value="mp4"]');
    opt.disabled = true;
    opt.textContent = "MP4 (no disponible en este Chrome)";
    $("rcFormat").value = "webm";
  }

  $("avFilesBtn").onclick = () => $("avFiles").click();
  $("avFiles").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
  $("avGo").onclick = runAV;
  $("avDl").onclick = downloadAll;
  $("avSelAll").onclick = () => { list.forEach((m) => (m.selected = true)); render(); };
  $("avSelNone").onclick = () => { list.forEach((m) => (m.selected = false)); render(); };
  $("avDelSel").onclick = () => {
    for (let k = list.length - 1; k >= 0; k--) if (list[k].selected) removeMedia(list[k]);
    render();
  };
  $("avClear").onclick = () => { while (list.length) removeMedia(list[0]); render(); };

  const dz = $("avDrop");
  dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("over"); });
  dz.addEventListener("dragleave", () => dz.classList.remove("over"));
  dz.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dz.classList.remove("over");
    if (e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  });

  window.Kit = { addMedia, render, extractAudio };
  render();
})();
