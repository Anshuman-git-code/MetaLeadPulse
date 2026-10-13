const express = require('express');
const router = express.Router();
const crypto = require('crypto');

const { retrieveLead } = require('../meta');
const { normalizeLead } = require('../leads');
const { publishLead } = require('../realtime');

router.use(express.raw({ type: '*/*' }));

router.get('/', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    console.log('Webhook verification request received');
    console.log('  hub.mode:', mode);
    console.log('  hub.verify_token received:', token ? 'YES' : 'NO');
    console.log('  hub.challenge:', challenge);

    if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
        console.log('Webhook verification successful — challenge returned');
        res.send(challenge);
    } else {
        if (mode !== 'subscribe') {
            console.warn('Webhook verification failed — unexpected mode:', mode);
        } else {
            console.warn('Webhook verification failed — token mismatch');
        }
        res.sendStatus(403);
    }
});

router.post('/', (req, res) => {
    const signature = req.headers['x-hub-signature-256'];

    if (!signature) {
        console.warn('Webhook POST rejected — no X-Hub-Signature-256 header');
        return res.sendStatus(400);
    }

    const expectedSignature = 'sha256=' + crypto
        .createHmac('sha256', process.env.META_APP_SECRET)
        .update(req.body)
        .digest('hex');

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
        console.warn('Webhook POST rejected — signature mismatch');
        return res.sendStatus(400);
    }

    res.sendStatus(200);

    let payload;
    try {
        payload = JSON.parse(req.body.toString());
    } catch (err) {
        console.error('Webhook POST — failed to parse body as JSON:', err.message);
        return;
    }

    console.log('Webhook POST received — object type:', payload.object);

    if (payload.object !== 'page') {
        console.log('Webhook POST — not a page event, skipping');
        return;
    }

    payload.entry.forEach((entry) => {
        entry.changes.forEach((change) => {
            if (change.field !== 'leadgen') {
                return;
            }

            const { leadgen_id, page_id, form_id, created_time } = change.value;

            console.log('Lead event received:');
            console.log('  leadgen_id:   ', leadgen_id);
            console.log('  page_id:      ', page_id);
            console.log('  form_id:      ', form_id);
            console.log('  created_time: ', created_time);

            (async () => {
                try {
                    const rawLead = await retrieveLead(leadgen_id);
                    const lead = normalizeLead(rawLead);

                    console.log('Normalized lead ready:');
                    console.log('  id:        ', lead.id);
                    console.log('  name:      ', lead.name);
                    console.log('  email:     ', lead.email);
                    console.log('  phone:     ', lead.phone || '(not provided)');
                    console.log('  createdAt: ', lead.createdAt);

                    publishLead(lead);
                } catch (err) {
                    console.error('Failed to retrieve or normalize lead:', err.message);
                }
            })();
        });
    });
});

module.exports = router;
