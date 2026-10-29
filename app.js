"use strict";

const params = new URLSearchParams(location.search);
const srcTab = params.has("tab") ? Number(params.get("tab")) : null;
const $ = (id) => document.getElementById(id);

// ---------- Pestañas ----------
let activeTab = "img";
function showTab(name) {
  activeTab = name;
  for (const t of ["img", "av", "url"]) $("tab-" + t).hidden = t !== name;
  document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("on", b.dataset.tab === name));
}
document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));

const items = []; // { id, name, blob, url, img, w, h, selected, result }
let nextId = 1;

const MIME = { jpeg: "image/jpeg", webp: "image/webp", png: "image/png" };
const EXT = { jpeg: "jpg", webp: "webp", png: "png" };

const fmtSize = (b) =>
  b >= 1048576 ? (b / 1048576).toFixed(2).replace(".", ",") + " MB" : Math.round(b / 1024) + " KB";
const setStatus = (m) => ($("status").textContent = m);

// ---------- Carga de imágenes ----------
function loadImg(url) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("no se pudo leer"));
    im.src = url;
  });
}

async function addBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await loadImg(url);
    items.push({
      id: nextId++, name, blob, url, img,
      w: img.naturalWidth, h: img.naturalHeight, selected: true, result: null,
    });
    return true;
  } catch {
    URL.revokeObjectURL(url);
    return false;
  }
}

async function addFiles(fileList) {
  const files = [...fileList].filter((f) => f.type.startsWith("image/"));
  if (!files.length) return setStatus("No he encontrado imágenes en lo que has soltado.");
  let bad = 0;
  for (const f of files) {
    if (!(await addBlob(f, f.name || "imagen"))) bad++;
  }
  renderGrid();
  setStatus(`${files.length - bad} imagen(es) añadidas` + (bad ? `, ${bad} no se pudieron leer.` : "."));
}

function nameFromUrl(u, i) {
  if (u.startsWith("data:")) return `imagen-${i}`;
  try {
    const last = decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() || "");
    if (last) return last;
  } catch {}
  return `imagen-${i}`;
}

async function loadFromTab() {
  if (srcTab == null || Number.isNaN(srcTab)) {
    return setStatus("Abre la extensión estando en la web que tiene las imágenes.");
  }
  setStatus("Buscando imágenes en la página…");
  let found;
  try {
    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: srcTab },
      func: () => {
        const map = new Map();
        document.querySelectorAll("img").forEach((im) => {
          const u = im.currentSrc || im.src;
          if (u && im.naturalWidth >= 64 && im.naturalHeight >= 64) map.set(u, u);
        });
        return [...map.values()];
      },
    });
    found = result || [];
  } catch (e) {
    return setStatus("No puedo leer esa pestaña (¿es una página interna de Chrome o ya está cerrada?).");
  }
  if (!found.length) return setStatus("No he encontrado imágenes grandes en esa página.");

  let ok = 0, fail = 0, i = 0;
  const queue = found.filter((u) => !u.startsWith("blob:"));
  fail += found.length - queue.length; // blob: no se puede leer desde fuera de la página
  const worker = async () => {
    while (queue.length) {
      const u = queue.shift();
      const n = ++i;
      try {
        const r = await fetch(u);
        const blob = await r.blob();
        if (!blob.type.startsWith("image/")) throw new Error("no es imagen");
        (await addBlob(blob, nameFromUrl(u, n))) ? ok++ : fail++;
      } catch {
        fail++;
      }
      setStatus(`Descargando imágenes de la página… ${ok + fail}/${found.length}`);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  renderGrid();
  setStatus(`${ok} imagen(es) cargadas de la página` + (fail ? `, ${fail} no se pudieron descargar.` : "."));
}

// ---------- Rejilla ----------
function updateCount() {
  const s = items.filter((i) => i.selected).length;
  $("count").textContent = items.length ? `${s} de ${items.length} seleccionadas` : "";
}

function renderGrid() {
  const grid = $("grid");
  grid.replaceChildren();
  if (!items.length) {
    const e = document.createElement("div");
    e.className = "empty";
    e.textContent = "Todavía no hay imágenes.";
    grid.append(e);
  }
  for (const it of items) {
    const card = document.createElement("div");
    card.className = "card" + (it.selected ? " sel" : "");

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = it.selected;
    cb.onchange = () => {
      it.selected = cb.checked;
      card.classList.toggle("sel", it.selected);
      updateCount();
    };

    const img = document.createElement("img");
    img.src = it.result ? it.result.url : it.url;
    img.alt = "";
    img.onclick = () => cb.click();

    const x = document.createElement("button");
    x.className = "x";
    x.type = "button";
    x.textContent = "✕";
    x.title = "Quitar";
    x.onclick = () => {
      URL.revokeObjectURL(it.url);
      if (it.result) URL.revokeObjectURL(it.result.url);
      items.splice(items.indexOf(it), 1);
      renderGrid();
    };

    const meta = document.createElement("div");
    meta.className = "meta";
    const nm = document.createElement("div");
    nm.className = "name";
    nm.textContent = it.name;
    nm.title = it.name;
    const info = document.createElement("div");
    info.className = "info";
    info.textContent = `${it.w}×${it.h} · ${fmtSize(it.blob.size)}`;
    meta.append(nm, info);

    if (it.result) {
      const r = it.result;
      const res = document.createElement("div");
      res.className = "res" + (r.over ? " warn" : "");
      res.textContent =
        `→ ${r.w}×${r.h} · ${fmtSize(r.blob.size)}` +
        (r.q != null ? ` · calidad ${Math.round(r.q * 100)}` : "") +
        (r.over ? " · no llega al peso objetivo" : "");
      meta.append(res);
      if (r.up > 1.5) {
        const w = document.createElement("div");
        w.className = "res warn";
        w.textContent = `⚠ ampliada ×${r.up.toFixed(1).replace(".", ",")}: se verá algo blanda`;
        meta.append(w);
      }
      const cb2 = document.createElement("button");
      cb2.type = "button";
      cb2.className = "cmpbtn";
      cb2.textContent = "Ver antes / después";
      cb2.onclick = () => openCompare(it);
      meta.append(cb2);
    }

    card.append(cb, img, x, meta);
    grid.append(card);
  }
  updateCount();
}

// ---------- Procesado ----------
function getOpts() {
  const num = (id) => {
    const v = parseInt($(id).value, 10);
    return v > 0 ? v : 0;
  };
  return {
    w: num("w"), h: num("h"), fit: $("fit").value, bg: $("bg").value,
    transparent: $("transp").checked, format: $("format").value,
    quality: Number($("q").value) / 100, targetKB: num("target"),
    sharp: Number($("sharp").value) / 100,
  };
}

// Reduce la imagen a la mitad por pasos antes del dibujado final: da un resultado más limpio
// que un solo salto grande cuando la imagen original es mucho mayor que la de salida.
function prescale(img, s) {
  let src = img, w = img.naturalWidth, h = img.naturalHeight, cur = 1;
  while (s < cur / 2) {
    const nw = Math.max(1, Math.round(w / 2)), nh = Math.max(1, Math.round(h / 2));
    const c = document.createElement("canvas");
    c.width = nw;
    c.height = nh;
    const x = c.getContext("2d");
    x.imageSmoothingQuality = "high";
    x.drawImage(src, 0, 0, nw, nh);
    src = c; w = nw; h = nh; cur /= 2;
  }
  return src;
}

// Máscara de enfoque suave (3x3). amount 0 = nada.
function sharpen(ctx, w, h, amount) {
  if (amount <= 0 || w < 3 || h < 3) return;
  const src = ctx.getImageData(0, 0, w, h);
  const s = src.data;
  const out = ctx.createImageData(w, h);
  const d = out.data;
  d.set(s);
  const k = 1 + 4 * amount;
  const row = w * 4;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * row + x * 4;
      for (let c = 0; c < 3; c++) {
        const j = i + c;
        d[j] = s[j] * k - amount * (s[j - 4] + s[j + 4] + s[j - row] + s[j + row]);
      }
    }
  }
  ctx.putImageData(out, 0, 0);
}

async function renderItem(it, o) {
  const iw = it.img.naturalWidth, ih = it.img.naturalHeight;
  let cw = o.w, ch = o.h;
  if (!cw) cw = Math.max(1, Math.round((iw * ch) / ih));
  if (!ch) ch = Math.max(1, Math.round((ih * cw) / iw));

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const keepAlpha = o.format !== "jpeg" && o.transparent;
  if (!keepAlpha) {
    ctx.fillStyle = o.bg;
    ctx.fillRect(0, 0, cw, ch);
  }

  let dw = cw, dh = ch;
  if (o.fit === "cover") {
    const s = Math.max(cw / iw, ch / ih);
    dw = iw * s; dh = ih * s;
  } else if (o.fit === "contain") {
    const s = Math.min(cw / iw, ch / ih);
    dw = iw * s; dh = ih * s;
  }
  const scale = Math.max(dw / iw, dh / ih);
  ctx.drawImage(prescale(it.img, scale), (cw - dw) / 2, (ch - dh) / 2, dw, dh);
  sharpen(ctx, cw, ch, o.sharp * 0.6);

  const mime = MIME[o.format];
  const toBlob = (q) => new Promise((r) => canvas.toBlob(r, mime, q));

  let blob, q = null, over = false;
  if (o.format === "png") {
    blob = await toBlob();
  } else if (o.targetKB) {
    const target = o.targetKB * 1024;
    let lo = 0.05, hi = 0.98;
    const top = await toBlob(hi);
    if (top.size <= target) {
      blob = top; q = hi;
    } else {
      const bottom = await toBlob(lo);
      if (bottom.size > target) {
        blob = bottom; q = lo; over = true;
      } else {
        blob = bottom; q = lo;
        for (let i = 0; i < 8; i++) {
          const mid = (lo + hi) / 2;
          const b = await toBlob(mid);
          if (b.size <= target) { blob = b; q = mid; lo = mid; } else { hi = mid; }
        }
      }
    }
  } else {
    q = o.quality;
    blob = await toBlob(q);
  }
  return {
    blob, url: URL.createObjectURL(blob), w: cw, h: ch, q, over, up: scale, ext: EXT[o.format],
    fit: o.fit, bg: o.bg, keepAlpha,
  };
}

async function processAll() {
  const sel = items.filter((i) => i.selected);
  if (!sel.length) return setStatus("Selecciona al menos una imagen.");
  const o = getOpts();
  if (!o.w && !o.h) return setStatus("Indica un ancho, un alto o ambos.");
  $("go").disabled = true;
  $("dl").disabled = true;
  let n = 0, failed = 0;
  for (const it of sel) {
    setStatus(`Procesando ${++n}/${sel.length}…`);
    try {
      if (it.result) URL.revokeObjectURL(it.result.url);
      it.result = await renderItem(it, o);
    } catch (e) {
      console.error(e);
      it.result = null;
      failed++;
    }
    await new Promise((r) => setTimeout(r));
  }
  renderGrid();
  const done = sel.filter((i) => i.result);
  if (done.length) {
    const sizes = done.map((i) => i.result.blob.size);
    const avg = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    $("summary").textContent =
      `${done.length} procesadas · peso medio ${fmtSize(avg)} (mín ${fmtSize(Math.min(...sizes))}, máx ${fmtSize(Math.max(...sizes))})`;
  } else {
    $("summary").textContent = "";
  }
  setStatus(failed ? `Listo, pero ${failed} fallaron.` : "Listo. Pulsa «Ver antes / después» en cada foto para comparar y «Descargar» cuando estés conforme.");
  $("go").disabled = false;
  $("dl").disabled = false;
}

// ---------- Descarga ----------
function save(blob, name) {
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10000);
}

async function download() {
  const done = items.filter((i) => i.selected && i.result);
  if (!done.length) return setStatus("Primero pulsa «Procesar seleccionadas».");
  const used = new Set();
  const files = [];
  for (const it of done) {
    const base = it.name.replace(/\.[^.]+$/, "") || "imagen";
    let name = `${base}.${it.result.ext}`;
    let k = 2;
    while (used.has(name.toLowerCase())) name = `${base}-${k++}.${it.result.ext}`;
    used.add(name.toLowerCase());
    files.push({ name, data: new Uint8Array(await it.result.blob.arrayBuffer()) });
  }
  if (files.length === 1) save(done[0].result.blob, files[0].name);
  else save(makeZip(files), "imagenes-igualadas.zip");
}

// ---------- Visor antes / después ----------
const cmp = { it: null, mode: "slide", zoom: false, pos: 50 };

const el = (cls) => {
  const d = document.createElement("div");
  d.className = cls;
  return d;
};

function openCompare(it) {
  if (!it.result) return;
  cmp.it = it;
  $("cmp").hidden = false;
  document.body.style.overflow = "hidden";
  renderCompare();
}

function closeCompare() {
  $("cmp").hidden = true;
  document.body.style.overflow = "";
  cmp.it = null;
}

function stepCompare(d) {
  const list = items.filter((i) => i.result);
  const k = list.indexOf(cmp.it);
  if (k < 0 || list.length < 2) return;
  cmp.it = list[(k + d + list.length) % list.length];
  renderCompare();
}

function cmpImg(src, fit) {
  const im = document.createElement("img");
  im.src = src;
  im.alt = "";
  im.style.objectFit = fit;
  return im;
}

function chip(text, right) {
  const c = el("chip");
  c.textContent = text;
  c.style[right ? "right" : "left"] = "8px";
  return c;
}

function makeStage(r, W, H) {
  const st = el("stage" + (r.keepAlpha ? " checker" : ""));
  st.style.width = W + "px";
  st.style.height = H + "px";
  if (!r.keepAlpha) st.style.background = r.bg;
  return st;
}

function renderCompare() {
  const it = cmp.it;
  if (!it || !it.result) return;
  const r = it.result;
  const list = items.filter((i) => i.result);

  const diff = Math.round((1 - r.blob.size / it.blob.size) * 100);
  const diffTxt = diff >= 0 ? `${diff} % menos peso` : `${-diff} % más peso`;
  $("cName").textContent = `${it.name}  (${list.indexOf(it) + 1}/${list.length})`;
  $("cStats").textContent =
    `Antes ${it.w}×${it.h} · ${fmtSize(it.blob.size)}  →  Después ${r.w}×${r.h} · ${fmtSize(r.blob.size)}` +
    (r.q != null ? ` · calidad ${Math.round(r.q * 100)}` : "") + ` · ${diffTxt}`;
  $("cMode").textContent = cmp.mode === "slide" ? "Ver lado a lado" : "Ver con deslizador";
  $("cZoom").textContent = cmp.zoom ? "Ajustar a pantalla" : "Zoom 1:1";
  $("cPrev").disabled = $("cNext").disabled = list.length < 2;

  const body = $("cBody");
  body.replaceChildren();
  const side = cmp.mode === "side";

  // Tamaño del recuadro: ajustado a la pantalla, o en píxeles reales (1:1) con scroll.
  const dpr = window.devicePixelRatio || 1;
  let W, H;
  if (cmp.zoom) {
    W = r.w / dpr;
    H = r.h / dpr;
  } else {
    const availW = body.clientWidth / (side ? 2 : 1) - 24;
    const availH = body.clientHeight - 12;
    const s = Math.min(1, availW / r.w, availH / r.h);
    W = r.w * s;
    H = r.h * s;
  }
  // El original se muestra con el mismo recorte/encaje que el resultado, para que coincidan.
  const beforeFit = r.fit === "stretch" ? "fill" : r.fit;

  if (!side) {
    const view = el("view");
    const st = makeStage(r, W, H);
    const after = cmpImg(r.url, "fill");
    const before = cmpImg(it.url, beforeFit);
    const line = el("line");
    st.append(after, before, line, chip("Antes"), chip("Después", true));
    const apply = () => {
      before.style.clipPath = `inset(0 ${100 - cmp.pos}% 0 0)`;
      line.style.left = cmp.pos + "%";
    };
    const move = (x) => {
      const b = st.getBoundingClientRect();
      cmp.pos = Math.max(0, Math.min(100, ((x - b.left) / b.width) * 100));
      apply();
    };
    st.style.cursor = "ew-resize";
    st.onpointerdown = (e) => {
      st.setPointerCapture(e.pointerId);
      move(e.clientX);
      st.onpointermove = (ev) => move(ev.clientX);
    };
    st.onpointerup = st.onpointercancel = () => (st.onpointermove = null);
    apply();
    view.append(st);
    body.append(view);
  } else {
    const mk = (label, src, fit) => {
      const view = el("view");
      const st = makeStage(r, W, H);
      st.append(cmpImg(src, fit), chip(label));
      view.append(st);
      return view;
    };
    const vb = mk("Antes", it.url, beforeFit);
    const va = mk("Después", r.url, "fill");
    // Los dos paneles se desplazan a la vez (útil con zoom 1:1).
    let origin = null;
    const link = (a, b) =>
      a.addEventListener("scroll", () => {
        if (origin && origin !== a) return;
        origin = a;
        b.scrollLeft = a.scrollLeft;
        b.scrollTop = a.scrollTop;
        requestAnimationFrame(() => (origin = null));
      });
    link(vb, va);
    link(va, vb);
    body.append(vb, va);
  }
}

$("cClose").onclick = closeCompare;
$("cMode").onclick = () => { cmp.mode = cmp.mode === "slide" ? "side" : "slide"; renderCompare(); };
$("cZoom").onclick = () => { cmp.zoom = !cmp.zoom; renderCompare(); };
$("cPrev").onclick = () => stepCompare(-1);
$("cNext").onclick = () => stepCompare(1);
document.addEventListener("keydown", (e) => {
  if ($("cmp").hidden) return;
  if (e.key === "Escape") closeCompare();
  else if (e.key === "ArrowLeft") stepCompare(-1);
  else if (e.key === "ArrowRight") stepCompare(1);
});
window.addEventListener("resize", () => { if (!$("cmp").hidden) renderCompare(); });

// ---------- Eventos ----------
$("filesBtn").onclick = () => $("files").click();
$("files").onchange = (e) => { addFiles(e.target.files); e.target.value = ""; };
$("pick").onclick = loadFromTab;
$("go").onclick = processAll;
$("dl").onclick = download;

$("selAll").onclick = () => { items.forEach((i) => (i.selected = true)); renderGrid(); };
$("selNone").onclick = () => { items.forEach((i) => (i.selected = false)); renderGrid(); };
$("delSel").onclick = () => {
  for (let k = items.length - 1; k >= 0; k--) {
    if (items[k].selected) {
      URL.revokeObjectURL(items[k].url);
      if (items[k].result) URL.revokeObjectURL(items[k].result.url);
      items.splice(k, 1);
    }
  }
  $("summary").textContent = "";
  renderGrid();
};
$("clear").onclick = () => {
  items.forEach((i) => { URL.revokeObjectURL(i.url); if (i.result) URL.revokeObjectURL(i.result.url); });
  items.length = 0;
  $("summary").textContent = "";
  renderGrid();
};
$("same").onclick = () => {
  const first = items.find((i) => i.selected);
  if (!first) return setStatus("Selecciona una imagen de referencia.");
  $("w").value = first.w;
  $("h").value = first.h;
};

$("q").oninput = () => ($("qv").textContent = $("q").value);
$("sharp").oninput = () => ($("sv").textContent = $("sharp").value);
function syncFormat() {
  const png = $("format").value === "png";
  $("q").disabled = png;
  $("target").disabled = png;
  $("targetHint").textContent = png
    ? "PNG no admite calidad ni peso objetivo y en fotos pesa muy por encima de WebP/JPEG. Usa WebP para reducir el peso."
    : "Si lo rellenas, se ajusta la calidad de cada imagen para acercarse a ese peso (ignora el slider).";
}
$("format").onchange = syncFormat;
syncFormat();

const drop = $("drop");
// Soltar un archivo fuera de una zona de carga no debe abrirlo en la pestaña, en ninguna pestaña.
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  if (activeTab === "img") drop.classList.add("over");
});
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) drop.classList.remove("over"); });
document.addEventListener("drop", (e) => {
  e.preventDefault();
  drop.classList.remove("over");
  if (activeTab === "img" && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});
document.addEventListener("paste", (e) => {
  if (activeTab !== "img") return;
  const files = [...(e.clipboardData ? e.clipboardData.files : [])];
  if (files.length) addFiles(files);
});

if (srcTab != null && !Number.isNaN(srcTab) && chrome.tabs) {
  chrome.tabs.get(srcTab).then(
       (t) => { const o = t.title || t.url; $("srcinfo").textContent = o ? `Web de origen: ${o}` : ""; },
    () => { $("srcinfo").textContent = ""; }
  );
}

renderGrid();
