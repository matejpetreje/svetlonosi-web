
(() => {
  "use strict";

  const button = document.getElementById("kickSubscriptionsButton");
  const message = document.getElementById("kickSubscriptionsMessage");

  if (!button || !message) {
    console.error("Chybí prvky Kick administrace.");
    return;
  }

  const cfg = window.SVETLONOSI_CONFIG;

  function setStatus(text, type = "info") {
    message.textContent = text;
    message.dataset.status = type;
  }

  if (!cfg?.SUPABASE_URL || !cfg?.SUPABASE_ANON_KEY || !window.supabase) {
    setStatus("Chyba: Supabase není načtený.", "error");
    button.disabled = true;
    return;
  }

  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  setStatus("Připraveno k aktivaci Kick událostí.");

  button.addEventListener("click", async () => {
    if (button.disabled) return;

    button.disabled = true;
    button.textContent = "Aktivuji…";
    setStatus("Ověřuji DM oprávnění…");

    try {
      const { data: userData, error: userError } =
        await db.auth.getUser();

      if (userError || !userData?.user) {
        throw new Error(
          "Nejsi přihlášený v DM panelu. Přihlas se a zkus to znovu."
        );
      }

      const { data: isDm, error: dmError } =
        await db.rpc("is_dm");

      if (dmError) {
        throw new Error("Kontrola DM: " + dmError.message);
      }

      if (isDm !== true) {
        throw new Error("Účet nemá DM oprávnění.");
      }

      setStatus("Komunikuji s Kick API. Vyčkej na výsledek…");

      const { data, error } = await db.functions.invoke(
        "kick-chat-overlay",
        {
          method: "POST",
          body: { action: "setup_subscriptions" }
        }
      );

      if (error) {
        let detail = error.message || "Neznámá chyba.";

        try {
          if (error.context?.json) {
            const payload = await error.context.json();
            detail = payload?.error || payload?.message || detail;
          }
        } catch (_) {}

        throw new Error(detail);
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Aktivace nebyla potvrzena.");
      }

      setStatus(
        "✓ " + (data.message || "Kick události byly aktivovány."),
        "success"
      );

    } catch (error) {
      setStatus(
        "✗ " + (error?.message || String(error)),
        "error"
      );
      console.error("Kick subscriptions:", error);

    } finally {
      button.disabled = false;
      button.textContent = "Znovu aktivovat Kick události";
    }
  });
})();
