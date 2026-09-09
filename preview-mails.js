"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const mail_service_1 = require("./src/mail/mail.service");
const captured = [];
const fakeProvider = {
    name: 'Preview',
    send: (mail) => {
        captured.push(mail);
        return Promise.resolve(true);
    },
};
const config = {
    get: (key) => ({
        FRONTEND_URL: 'https://petrogassa.com',
        CONTACT_INBOX_EMAIL: 'contacto@petrogassa.com',
        ACCOUNT_ACTIVATION_TOKEN_EXPIRES_IN_HOURS: 48,
        VERIFICATION_TOKEN_EXPIRES_IN_HOURS: 1,
    })[key],
};
async function main() {
    const service = new mail_service_1.MailService(fakeProvider, config);
    await service.sendActivationEmail('nuevo.usuario@petrogassa.com', 'a9cd571da5245d75b592dc1a9454ef0e');
    await service.sendPasswordResetEmail('usuario@petrogassa.com', 'TOKEN-RESET-456', 'Nicolás');
    await service.sendContactNotification({
        id: 'msg-ejemplo',
        name: 'Juan Pérez',
        email: 'juan.perez@empresa.com',
        phone: '297 400-0000',
        subject: 'Consulta por Well Testing',
        message: 'Hola, quería consultar por el servicio para un pozo en Cerro Dragón.\n\nQuedo atento. Saludos.',
    });
    const bloques = captured
        .map((m) => {
        let html = m.html;
        for (const img of m.inlineImages ?? []) {
            html = html.split(`cid:${img.cid}`).join(`data:${img.contentType};base64,${img.content.toString('base64')}`);
        }
        return `
      <div class="sobre">
        <div class="bandeja">
          <div class="asunto">${m.subject}</div>
          <div class="snippet"><strong>En la bandeja:</strong> ${m.previewText ?? '—'}</div>
          <div class="dest">Para: ${m.to}${m.replyTo ? ` · Responder a: ${m.replyTo}` : ''}${m.inlineImages?.length ? ' · con banner embebido' : ''}</div>
        </div>
        <iframe srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>
      </div>`;
    })
        .join('\n');
    (0, fs_1.writeFileSync)('preview-correos.html', `<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Correos — Petrogas S.A.</title><style>
 body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#dfe3ea;margin:0;padding:24px;color:#1f2733}
 h1{font-size:19px;margin:0 0 4px}p.i{color:#5b6676;font-size:13px;margin:0 0 22px}
 .sobre{max-width:780px;margin:0 auto 26px;background:#fff;border:1px solid #cdd4e0;border-radius:10px;overflow:hidden}
 .bandeja{padding:12px 16px;background:#f7f9fc;border-bottom:1px solid #cdd4e0}
 .asunto{font-weight:700;font-size:14px;margin-bottom:3px}
 .snippet{font-size:12px;color:#5b6676;margin-bottom:3px}
 .dest{font-size:11px;color:#8a94a6}
 iframe{width:100%;height:900px;border:0;display:block;background:#eef0f4}
</style></head><body>
<h1>Correos transaccionales — Petrogas S.A.</h1>
<p class="i">Generados con el MailService real. El banner se muestra embebido, igual que lo recibe el destinatario.</p>
${bloques}</body></html>`, 'utf8');
    console.log('OK: ' + captured.length + ' correos');
}
void main();
//# sourceMappingURL=preview-mails.js.map