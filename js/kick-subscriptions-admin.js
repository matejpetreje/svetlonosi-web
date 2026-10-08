
(() => {
  "use strict";

  const button = document.getElementById("kickSubscriptionsButton");
  const message = document.getElementById("kickSubscriptionsMessage");

  if (!button || !message) return;

  const cfg = window.SVETLONOSI_CONFIG;
  const db = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY
  );

  button.addEventListener("click", async () => {
    button.disabled = true;
    message.textContent = "Kontroluji DM oprávnění…";

    try {
      const { data: auth, error: authError } =
        await db.auth.getUser();

      if (authError || !auth?.user) {
        throw new Error("Nejdřív se přihlas jako DM.");
      }

      const { data: isDm, error: dmError } =
        await db.rpc("is_dm");

      if (dmError || isDm !== true) {
        throw new Error("Nemáš DM oprávnění.");
      }

      message.textContent = "Aktivuji Kick události…";

      const { data, error } = await db.functions.invoke(
        "kick-chat-overlay",
        {
          body: { action: "setup_subscriptions" }
        }
      );

      if (error) {
        let detail = error.message;

        try {
          const body = await error.context?.json();
          detail = body?.error || body?.message || detail;
        } catch (_) {}

        throw new Error(detail);
      }

      if (!data?.ok) {
        throw new Error(data?.error || "Aktivace selhala.");
      }

      message.textContent =
        data.message || "Kick události byly aktivovány.";

    } catch (error) {
      message.textContent = "Chyba: " + error.message;
    } finally {
      button.disabled = false;
    }
  });
})();
