'use strict';
(function () {
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const refInput = document.getElementById('vRef');
  const codeInput = document.getElementById('vCode');
  const out = document.getElementById('vOut');

  if (params.get('ref')) refInput.value = params.get('ref');
  if (params.get('c')) codeInput.value = params.get('c');

  async function check() {
    const rVal = refInput.value.trim();
    const cVal = codeInput.value.trim();
    if (!rVal || !cVal) return;
    out.innerHTML = '<p class="mut">Verifying cryptographic signature…</p>';
    try {
      const res = await fetch(`api/public/verify?ref=${encodeURIComponent(rVal)}&c=${encodeURIComponent(cVal)}`, { cache: 'no-store' });
      const d = await res.json();
      if (d.status === 'verified') {
        out.innerHTML = `
          <div class="v-ok">
            <h3 style="margin:0;color:#15803d">✅ VERIFIED GENUINE DOCUMENT (सत्यापित वैध दस्तावेज़)</h3>
            <p style="margin:4px 0 8px;font-size:12.5px">This document's digital HMAC-SHA256 signature matches the official register.</p>
            <div class="v-grid">
              <b>Issuing Institution:</b><span>${esc(d.institution)} ${d.institutionHi ? '<br><small>' + esc(d.institutionHi) + '</small>' : ''}</span>
              <b>U-DISE / Affiliation:</b><span>U-DISE: ${esc(d.udise)} · CBSE: ${esc(d.cbseAff)}</span>
              <b>Ref. No. (पत्रांक):</b><span><b>${esc(d.ref)}</b></span>
              <b>Issue Date (दिनांक):</b><span>${esc(d.date)}</span>
              <b>Major Head (मद):</b><span>${esc(d.majorHead)}</span>
              <b>Document / Subject:</b><span>${esc(d.documentTitle)}</span>
              <b>Issued To / Party:</b><span>${esc(d.issuedTo)}</span>
              <b>Signing Authority:</b><span>${esc(d.signatory)}</span>
              <b>Verification Code:</b><span><code>${esc(d.verifyCode)}</code></span>
            </div>
          </div>`;
      } else if (d.status === 'cancelled') {
        out.innerHTML = `
          <div class="v-rev">
            <h3 style="margin:0;color:#b91c1c">🚫 CANCELLED / REVOKED DOCUMENT (रद्द दस्तावेज़)</h3>
            <p style="margin:6px 0 0;font-size:13px">Ref. No. <b>${esc(d.ref)}</b> was officially cancelled by ${esc(d.institution)}.</p>
            <p style="margin:4px 0 0;font-size:12.5px"><b>Reason:</b> ${esc(d.cancelReason || 'N/A')}</p>
          </div>`;
      } else {
        out.innerHTML = `
          <div class="v-rev">
            <h3 style="margin:0;color:#b91c1c">❌ VERIFICATION FAILED (अमान्य / असत्यापित)</h3>
            <p style="margin:6px 0 0;font-size:13px">${esc(d.message || 'Could not verify this document.')}</p>
          </div>`;
      }
    } catch (e) {
      out.innerHTML = `<div class="v-rev">Error connecting to verification server.</div>`;
    }
  }

  document.getElementById('vf').onsubmit = e => { e.preventDefault(); check(); };
  if (params.get('ref') && params.get('c')) check();
})();
