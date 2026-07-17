// ============================================================================
// Bloqueio de e-mail descartável no cadastro — lista curada de provedores
// temporários/anônimos conhecidos. Não é exaustiva; objetivo é elevar o custo
// de farm de contas, não fechar 100% dos casos.
// ============================================================================

const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "mailinator.net", "mailinator.org",
  "yopmail.com", "yopmail.fr", "yopmail.net",
  "10minutemail.com", "10minutemail.net", "10minutemail.co.za",
  "guerrillamail.com", "guerrillamail.net", "guerrillamail.org", "guerrillamail.biz",
  "sharklasers.com", "grr.la", "guerrillamailblock.com",
  "tempmail.com", "temp-mail.org", "temp-mail.io", "tempmail.net", "tempmailo.com",
  "throwawaymail.com", "trashmail.com", "trashmail.net", "trash-mail.com",
  "dispostable.com", "disposablemail.com", "getnada.com", "getairmail.com",
  "maildrop.cc", "mintemail.com", "moakt.com", "moakt.cc",
  "fakeinbox.com", "fakemailgenerator.com", "emailondeck.com",
  "mytemp.email", "mohmal.com", "mohmal.im", "spam4.me", "spamgourmet.com",
  "harakirimail.com", "mailnesia.com", "mailcatch.com", "mailsac.com",
  "burnermail.io", "inboxbear.com", "tempinbox.com", "tempr.email",
  "discard.email", "discardmail.com", "spambog.com", "spamex.com",
  "anonbox.net", "meltmail.com", "mailtemp.info", "mail-temp.com",
  "tempemail.co", "tempemail.net", "tempail.com", "tempmailaddress.com",
  "33mail.com", "airmail.cc", "byom.de", "cool.fr.nf", "courriel.fr.nf",
  "jetable.org", "jetable.net", "kasmail.com", "linshiyouxiang.net",
  "nada.email", "nowmymail.com", "onewaymail.com", "owlymail.com",
  "shieldedmail.com", "spoofmail.de", "wegwerfmail.de", "wegwerfmail.net",
  "yopmail.pl", "zippymail.info",
]);

export function isDisposableEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && DISPOSABLE_DOMAINS.has(domain);
}
