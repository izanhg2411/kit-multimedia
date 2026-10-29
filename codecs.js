"use strict";
// Codificadores: audio (WAV, MP3 con lamejs) y GIF (gifenc). Globales usadas por media.js.
const yieldUI = () => new Promise((r) => setTimeout(r));

// chans: Float32Array[] -> 1 o 2 canales
function mixChannels(chans, mono) {
  if (chans.length === 1) return [chans[0]];
  if (mono) {
    const n = chans[0].length, out = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (const c of chans) s += c[i];
      out[i] = s / chans.length;
    }
    return [out];
  }
  return [chans[0], chans[1]];
}

function floatToInt16(f) {
  const o = new Int16Array(f.length);
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i]));
    o[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return o;
}

function encodeWav(chans, rate) {
  const nch = chans.length, n = chans[0].length;
  const buf = new ArrayBuffer(44 + n * nch * 2);
  const v = new DataView(buf);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * nch * 2, true); str(8, "WAVE");
  str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nch, true);
  v.setUint32(24, rate, true); v.setUint32(28, rate * nch * 2, true); v.setUint16(32, nch * 2, true); v.setUint16(34, 16, true);
  str(36, "data"); v.setUint32(40, n * nch * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < nch; c++) {
      const s = Math.max(-1, Math.min(1, chans[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return new Blob([buf], { type: "audio/wav" });
}

async function encodeMp3(chans, rate, kbps, onProgress) {
  const nch = chans.length;
  const enc = new lamejs.Mp3Encoder(nch, rate, kbps);
  const L = floatToInt16(chans[0]);
  const R = nch > 1 ? floatToInt16(chans[1]) : null;
  const out = [];
  const BLOCK = 1152;
  for (let i = 0, k = 0; i < L.length; i += BLOCK, k++) {
    const buf = nch > 1
      ? enc.encodeBuffer(L.subarray(i, i + BLOCK), R.subarray(i, i + BLOCK))
      : enc.encodeBuffer(L.subarray(i, i + BLOCK));
    if (buf.length) out.push(new Uint8Array(buf));
    if (k % 200 === 0) { onProgress(i / L.length); await yieldUI(); }
  }
  const end = enc.flush();
  if (end.length) out.push(new Uint8Array(end));
  return new Blob(out, { type: "audio/mpeg" });
}

// GIF (gifenc cargado por vendor/gifenc-init.js como window.GIFEnc)
function gifBegin() {
  if (!window.GIFEnc) throw new Error("el codificador GIF no se ha cargado");
  return window.GIFEnc.GIFEncoder();
}
function gifAddFrame(gif, rgba, w, h, delayMs) {
  const { quantize, applyPalette } = window.GIFEnc;
  const palette = quantize(rgba, 256);
  const index = applyPalette(rgba, palette);
  gif.writeFrame(index, w, h, { palette, delay: delayMs });
}
function gifEnd(gif) {
  gif.finish();
  return new Blob([gif.bytes()], { type: "image/gif" });
}
