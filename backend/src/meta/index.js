const GRAPH_API_BASE = 'https://graph.facebook.com/v26.0';

async function retrieveLead(leadgenId) {
    const token = process.env.META_PAGE_ACCESS_TOKEN;

    if (!token) {
        throw new Error('META_PAGE_ACCESS_TOKEN is not set in environment variables');
    }

    const url = `${GRAPH_API_BASE}/${leadgenId}?access_token=${token}`;

    console.log(`Retrieving lead ${leadgenId} from Meta Graph API...`);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    let response;
    try {
        response = await fetch(url, { signal: controller.signal });
    } catch (err) {
        if (err.name === 'AbortError') {
            throw new Error(`Meta Graph API timed out for lead ${leadgenId}`);
        }
        throw new Error(`Meta Graph API network error: ${err.message}`);
    } finally {
        clearTimeout(timeout);
    }

    if (!response.ok) {
        throw new Error(
            `Meta Graph API returned HTTP ${response.status} for lead ${leadgenId}`
        );
    }

    let data;
    try {
        data = await response.json();
    } catch (err) {
        throw new Error(`Meta Graph API returned invalid JSON for lead ${leadgenId}`);
    }

    if (data.error) {
        throw new Error(
            `Meta Graph API error: ${data.error.message} (code ${data.error.code})`
        );
    }

    console.log(`Lead ${leadgenId} retrieved successfully`);
    return data;
}

module.exports = { retrieveLead };
