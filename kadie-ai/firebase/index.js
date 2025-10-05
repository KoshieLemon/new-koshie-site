<!-- Load this in your Kadie AI pages to talk to the config API. -->
<script>
  window.KadieFirebase = {
    async getConfig(guildId){
      const r = await fetch(`/api/config?guild_id=${encodeURIComponent(guildId)}`, { credentials: "include" });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    async setConfig(guildId, data){
      const r = await fetch(`/api/config?guild_id=${encodeURIComponent(guildId)}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    }
  };
</script>
