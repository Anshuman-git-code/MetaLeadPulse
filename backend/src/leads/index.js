function findField(fieldData, fieldName) {
    const field = fieldData.find((f) => f.name === fieldName);
    return field?.values?.[0] || '';
}

function normalizeLead(metaLead) {
    if (!metaLead || typeof metaLead !== 'object') {
        throw new Error('normalizeLead: input must be a non-null object');
    }

    const { id, created_time, field_data } = metaLead;

    if (!id) {
        throw new Error('normalizeLead: lead is missing an id');
    }

    const fields = Array.isArray(field_data) ? field_data : [];

    const email = findField(fields, 'email');

    if (!email) {
        console.warn(`normalizeLead: lead ${id} has no email field`);
    }

    const phone = findField(fields, 'phone');

    if (!phone) {
        console.warn(`normalizeLead: lead ${id} has no phone field`);
    }

    return {
        id: String(id),
        name: findField(fields, 'full_name') || 'Unknown',
        email: email,
        phone: findField(fields, 'phone_number'),
        createdAt: created_time || new Date().toISOString(),
    };
}

module.exports = { normalizeLead };
