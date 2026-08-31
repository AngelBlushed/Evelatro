/* ===========================================================
   La connexion Discord, gérée différemment selon l'endroit où
   tourne le jeu :
     - .exe (Electron) : fenêtre d'auth pilotée par le process
       principal, qui intercepte la redirection
     - .apk (Capacitor) : navigateur intégré + lien profond
     - site web (Netlify) : redirection OAuth classique, retour géré
       par completeBrowserRedirect()
   Cote Supabase : ajouter l'URL du site dans Authentication >
   URL Configuration > Redirect URLs (ex: https://<site>.netlify.app/**).
   =========================================================== */

const AuthFlow = (() => {

  function platform() {
    if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) return 'native';
    if (window.electronAuth && typeof window.electronAuth.oauth === 'function') return 'electron';
    return 'browser';
  }

  async function signIn(client) {
    const p = platform();
    if (p === 'electron') return electronSignIn(client);
    if (p === 'native') return nativeSignIn(client);
    return browserSignIn(client);
  }

  // URL de la page, sans query ni hash (sert de redirect Discord côté web)
  function pageUrl() {
    return window.location.origin + window.location.pathname;
  }

  // Navigateur (site web) : redirection classique vers Discord puis retour.
  async function browserSignIn(client) {
    const { error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo: pageUrl() },
    });
    if (error) throw error;
    // le navigateur quitte la page ; le retour est géré par completeBrowserRedirect()
  }

  // À appeler au chargement : si on revient de Discord, ouvre la session et
  // nettoie l'URL. Renvoie { ok, done, error } :
  //   done  = on revenait bien d'un aller-retour Discord
  //   ok    = la session a été ouverte
  //   error = message lisible si ça a échoué (à afficher à l'utilisateur)
  async function completeBrowserRedirect(client) {
    if (platform() !== 'browser') return { ok: false, done: false };
    const u = new URL(window.location.href);
    // le retour peut arriver en ?query OU en #hash selon la config Supabase
    const hash = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
    const pick = k => u.searchParams.get(k) || hash.get(k);

    const code = pick('code');
    const access_token = pick('access_token');
    const refresh_token = pick('refresh_token');
    const err = pick('error_description') || pick('error');

    const cleanUrl = () => {
      ['code', 'error', 'error_description', 'error_code', 'state', 'provider'].forEach(k => u.searchParams.delete(k));
      window.history.replaceState({}, document.title, u.pathname + (u.search || ''));
    };

    if (!code && !access_token && !err) return { ok: false, done: false };

    if (err) {
      cleanUrl();
      return { ok: false, done: true, error: humanAuthError(err) };
    }
    try {
      if (code) await client.auth.exchangeCodeForSession(code);
      else if (access_token && refresh_token) await client.auth.setSession({ access_token, refresh_token });
      cleanUrl();
      return { ok: true, done: true };
    } catch (e) {
      cleanUrl();
      return { ok: false, done: true, error: humanAuthError(e && e.message) };
    }
  }

  // Traduit les erreurs OAuth fréquentes en quelque chose d'utile.
  function humanAuthError(raw) {
    const s = (raw || '').toString();
    if (/redirect|requested path is invalid|not allowed/i.test(s)) {
      return "Adresse de retour refusée par Supabase. Ajoute l'URL du site dans "
        + "Supabase > Authentication > URL Configuration > Redirect URLs "
        + "(ex : https://<ton-site>.netlify.app/**).";
    }
    if (/exchange external code|server_error|invalid client|unauthorized_client/i.test(s)) {
      return "Discord a refusé l'échange. Le « Client Secret » Discord dans Supabase "
        + "(Authentication > Providers > Discord) est peut-être périmé — régénère-le côté "
        + "Discord et recopie-le dans Supabase.";
    }
    if (/access_denied/i.test(s)) return "Connexion annulée côté Discord.";
    return s || 'Connexion Discord impossible.';
  }

  async function electronSignIn(client) {
    const redirectTo = MP_CONFIG.REDIRECT_ELECTRON;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;
    const finalUrl = await window.electronAuth.oauth(data.url, redirectTo);
    if (!finalUrl) throw new Error('CANCELLED');
    await applyRedirect(client, finalUrl);
  }

  function cap(name) {
    const P = window.Capacitor;
    return (P.Plugins && P.Plugins[name]) || (P.registerPlugin && P.registerPlugin(name));
  }

  async function nativeSignIn(client) {
    const redirectTo = MP_CONFIG.REDIRECT_NATIVE;
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo, skipBrowserRedirect: true },
    });
    if (error) throw error;

    const Browser = cap('Browser');
    const App = cap('App');
    return new Promise((resolve, reject) => {
      let handled = false;
      const finish = async (url) => {
        if (handled) return;
        handled = true;
        try { listener.then(l => l.remove()); } catch (e) {}
        try { await Browser.close(); } catch (e) {}
        try { await applyRedirect(client, url); resolve(); }
        catch (e) { reject(e); }
      };
      const listener = App.addListener('appUrlOpen', ev => {
        if (ev && ev.url && ev.url.indexOf(redirectTo) === 0) finish(ev.url);
      });
      Browser.open({ url: data.url }).catch(reject);
      // sécurité : si l'utilisateur ferme le navigateur sans finir
      Browser.addListener('browserFinished', () => {
        setTimeout(() => { if (!handled) { handled = true; reject(new Error('CANCELLED')); } }, 400);
      });
    });
  }

  // Récupère les jetons dans l'URL de retour et ouvre la session.
  async function applyRedirect(client, url) {
    const q = url.split('?')[1] || '';
    const h = url.split('#')[1] || '';
    const params = new URLSearchParams(q || h);

    const code = params.get('code');
    if (code) { await client.auth.exchangeCodeForSession(code); return; }

    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await client.auth.setSession({ access_token, refresh_token });
      return;
    }
    const errDesc = params.get('error_description') || params.get('error');
    throw new Error(errDesc || 'Réponse Discord illisible');
  }

  return { signIn, platform, completeBrowserRedirect };
})();

window.AuthFlow = AuthFlow;
