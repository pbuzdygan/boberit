import { createHmac } from 'node:crypto';
import { addWebhookDelivery, webhookTargets } from './db/webhooks.js';
import { postWebhook } from './outbound.js';
import { decryptSecret } from './secrets.js';

export function notify(event: string, data: unknown, householdId: string): void {
  const body = JSON.stringify({ event, occurredAt: new Date().toISOString(), data });
  for (const target of webhookTargets(event, householdId)) {
    const secret = decryptSecret(typeof target.secret_encrypted === 'string' ? target.secret_encrypted : null);
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Boberit-Event': event };
    if (secret) headers['X-Boberit-Signature'] = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    const targetUrl = String(target.url);
    const discord = /^https:\/\/discord(?:app)?\.com\/api\/webhooks\//.test(targetUrl);
    const item = (data as { name?: string }).name ?? 'bez nazwy';
    const copy: Record<string, { title: string; text: string; color: number }> = {
      'asset.created': { title: 'Dodano przedmiot', text: `**${item}** został dodany do kolekcji.`, color: 0x22c55e },
      'asset.deleted': {
        title: 'Przedmiot przeniesiono do Kosza',
        text: `**${item}** będzie dostępny do przywrócenia przez 30 dni.`,
        color: 0xef4444,
      },
      'document.created': { title: 'Dodano dokument', text: `**${item}** trafił do Segregatora.`, color: 0x22c55e },
      'document.deleted': {
        title: 'Dokument przeniesiono do Kosza',
        text: `**${item}** będzie dostępny do przywrócenia przez 30 dni.`,
        color: 0xef4444,
      },
    };
    const message = copy[event] ?? { title: 'Zdarzenie Boberit', text: event, color: 0x0068e8 };
    const outbound = discord
      ? JSON.stringify({
          username: 'Boberit',
          embeds: [
            {
              title: message.title,
              description: message.text,
              color: message.color,
              footer: { text: 'Boberit' },
              timestamp: new Date().toISOString(),
            },
          ],
        })
      : body;
    void postWebhook(targetUrl, headers, outbound)
      .then((status) => {
        addWebhookDelivery({
          webhookId: String(target.id),
          event,
          status,
          error: status >= 200 && status < 300 ? null : `HTTP ${status}`,
        });
        console.log(`Webhook ${String(target.name)} · ${event} · HTTP ${status}`);
      })
      .catch((error) => {
        addWebhookDelivery({ webhookId: String(target.id), event, status: null, error: String(error) });
        console.error(`Webhook ${String(target.name)} · ${event} · błąd wysyłki:`, error);
      });
  }
}
