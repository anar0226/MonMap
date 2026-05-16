(function () {
  const { createClient } = supabase;
  window._sb = createClient(
    'https://brykoxmygtiyrssmsvys.supabase.co',
    'sb_publishable_uSMjxKn7SekbxCdG_qUvgA_PowBAkeA'
  );

  // hCaptcha site key for login/register forms.
  //   1. Supabase dashboard → Authentication → Settings → "Bot and abuse protection"
  //      → enable hCaptcha and copy the site key from there.
  //   2. Paste the site key below.
  // The Supabase auth server is configured to REQUIRE a captchaToken on every
  // auth call (see supabase/config.toml [auth.captcha]). Auth will hard-fail
  // until this site key is set to match the secret configured server-side.
  window._HCAPTCHA_SITE_KEY = 'f3dc7bf4-efd6-4df2-b0f8-98e02c3c51ce';

  // Mapbox public access token (pk.*) — safe to ship in client. Used by the
  // pin-placement map in register.html so business owners can visually confirm
  // their POI location. The matching style URL is the default Standard.
  window._MAPBOX_TOKEN = 'pk.eyJ1IjoiYW5hcmJvcmdpbCIsImEiOiJjbWhvcjNzOTEwZnQ5MmtweG9sZHQ2emI1In0.vuu5yDt0oDjNxy3xSD8pWg';
})();
