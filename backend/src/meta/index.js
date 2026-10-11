const GRAPH_API_BASE = 'https://graph.facebook.com/v26.0';

async function retrieveLead(leadgenId) {
    const token = process.env.META_PAGE_ACCESS_TOKEN;

    if (!token) {
        throw new Error('META_PAGE_ACCESS_TOKEN is not set in environment variables');
    }

    const url = `${GRAPH_API_BASE}/${leadgenId}?access_token=${token}`;

    console.log(`Retrieving lead ${leadgenId} from Meta Graph API...`);

    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
        throw new Error(
            `Meta Graph API error: ${data.error.message} (code ${data.error.code})`
        );
    }

    console.log(`Lead ${leadgenId} retrieved successfully`);

    return data;
}

module.exports = { retrieveLead };
