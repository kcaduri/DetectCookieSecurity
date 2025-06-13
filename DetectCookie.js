(async function() {
  // Util for escaping HTML
  function esc(s) {
    return (s+"").replace(/[&<>"']/g, m=>({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[m]));
  }

  // Parse document.cookie (JS-accessible only)
  function parseCookies() {
    return document.cookie.split(';').filter(Boolean).map(cookieStr => {
      const [name, ...rest] = cookieStr.trim().split('=');
      return { name: decodeURIComponent(name), value: decodeURIComponent(rest.join('=')) };
    });
  }

  function guessPurpose(name) {
    name = name.toLowerCase();
    if (/csrf|xsrf|antiforgery/.test(name)) return "CSRF protection token";
    if (/sess|sessionid|phpsessid|sid|jsessionid/.test(name)) return "Session identifier";
    if (/auth|token|jwt|access|refresh/.test(name)) return "Authentication/authorization token";
    if (/lang|locale|currency|country/.test(name)) return "Localization preference";
    if (/cart|basket|checkout/.test(name)) return "Shopping cart/session";
    if (/consent|cookie_consent|gdpr/.test(name)) return "Cookie consent/tracking";
    if (/track|ga|gid|fbp|_utm|_ga|_gid|_gcl/.test(name)) return "Analytics/tracking";
    return "Unknown or application-specific";
  }

  // Try to get attribute info via CookieStore API (modern Chrome/Edge)
  async function getCookieAttributes(cookies) {
    let cookieAttributes = {};
    if (window.cookieStore && cookieStore.getAll) {
      const storeCookies = await cookieStore.getAll();
      storeCookies.forEach(sc => {
        cookieAttributes[sc.name] = {
          secure: sc.secure ? "Set" : "❗ Not set (should be Secure)",
          httpOnly: sc.httpOnly ? "Set" : "❗ Not set or unknown (not available to JS)",
          sameSite: sc.sameSite ? sc.sameSite : "Unknown"
        };
      });
    } else {
      // Fallback: best-guess
      cookies.forEach(c => {
        cookieAttributes[c.name] = {
          secure: location.protocol === "https:" ? "❗ Not set (should be Secure)" : "Page is not HTTPS",
          httpOnly: "Not set or unknown (not available to JS)",
          sameSite: "Unknown (not available via JS)"
        };
      });
    }
    return cookieAttributes;
  }

  // Build HTML report
  async function run() {
    const cookies = parseCookies();
    const cookieAttributes = await getCookieAttributes(cookies);

    let html = `
    <html><head>
    <meta charset="utf-8">
    <title>Cookie Security Analyzer Report</title>
    <style>
      body { font-family:sans-serif; max-width:900px; margin:2em auto; background:#f7fafc; }
      h1,h2 { color:#22456B; }
      .cookie-box { background:#fff; border-radius:6px; margin-bottom:18px; box-shadow:0 1px 4px #0001; padding:1em; }
      .cookie-box ul { margin:0 0 0.5em 1em;}
      .key { color:#444;font-weight:bold;}
      .warn { color:#c22; font-weight:bold;}
      .ok { color:#2a5; font-weight:bold;}
      code { background:#eee; padding:2px 5px; border-radius:3px;}
      .purpose { font-size:0.98em; }
      .footer { margin-top:2em; color:#888; font-size:90%; }
      summary { font-weight:bold; font-size:1.07em;}
    </style>
    </head><body>
    <h1>Cookie Security Analyzer Report</h1>
    <p>For page: <code>${esc(location.href)}</code></p>
    <h2>Cookies Detected (${cookies.length})</h2>
    `;

    if (cookies.length === 0) {
      html += `<div class="cookie-box"><b>No cookies found for this domain (or all are HttpOnly, or set on a different path).</b></div>`;
    }

    cookies.forEach((c, idx) => {
      const isSession = !c.value || c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('sessid') || c.name.toLowerCase().includes('sid') || c.name.toLowerCase().includes('jsessionid');
      const isImportant = /(auth|csrf|xsrf|token|session|phpsessid|sid|jsessionid)/i.test(c.name);
      const purpose = guessPurpose(c.name);
      const attrs = cookieAttributes[c.name] || {};
      html += `<details class="cookie-box" open>
      <summary>Cookie #${idx+1}: <code>${esc(c.name)}</code></summary>
      <ul>
        <li><span class="key">Purpose:</span> <span class="purpose">${esc(purpose)}</span></li>
        <li><span class="key">Type:</span> ${isSession ? `<span class="ok">SESSION cookie</span>` : "Persistent or other"}</li>
        <li>${isImportant ? `<span class="warn">🔒 Important (session/auth/CSRF) cookie</span>` : "Likely non-sensitive or application-specific cookie"}</li>
        <li><span class="key">Value:</span> <code>${esc(c.value.length > 100 ? c.value.slice(0,100)+"..." : c.value)}</code></li>
        <li><span class="key">Secure:</span> ${attrs.secure||"Unknown"}</li>
        <li><span class="key">HttpOnly:</span> ${attrs.httpOnly||"Unknown"}</li>
        <li><span class="key">SameSite:</span> ${attrs.sameSite||"Unknown"}</li>
      </ul>
      </details>`;
    });

    html += `
    <h2>Best Practices & Security Recommendations</h2>
    <div class="cookie-box">
    <ul>
      <li>All cookies holding <b>session, authentication, or CSRF</b> data should be set with <code>Secure</code> (HTTPS only), <code>HttpOnly</code> (not accessible in JS), and <code>SameSite</code> (preferably <b>Lax</b> or <b>Strict</b>).</li>
      <li>Session cookies should have no expiry or a short expiry.</li>
      <li>If you see any cookies here that should be HttpOnly, but are accessible in JS, <b>review your backend settings</b>.</li>
      <li>For <b>full visibility</b> (including HttpOnly, expiry, domain/path), use your browser DevTools:
        <ul>
          <li>Network tab &rarr; review <b>Set-Cookie</b> headers</li>
          <li>Application/Storage tab &rarr; Cookies section</li>
        </ul>
      </li>
      <li>Avoid setting cookies on broad domains (e.g. <code>.example.com</code>) unless necessary.</li>
      <li>Minimize number of cookies, and limit third-party cookies when possible.</li>
    </ul>
    </div>
    <div class="footer">Generated by Cookie Security Analyzer • ${new Date().toLocaleString()}</div>
    </body></html>`;

    // --- Download HTML file
    const blob = new Blob([html], {type: 'text/html'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cookie-security-report.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    console.log("Cookie Analyzer HTML report downloaded as cookie-security-report.html");
  }
  run();
})();
