function findField(fieldData, fieldName) {
    const field = fieldData.find((f) => f.name === fieldName);
    return field?.values?.[0] || '';
}

function normalizeLead(metaLead) {
    const { id, created_time, field_data = [] } = metaLead;

    return {
        id: String(id),
        name: findField(field_data, 'full_name'),
        email: findField(field_data, 'email'),
        phone: findField(field_data, 'phone_number'),
        createdAt: created_time,
    };
}

module.exports = { normalizeLead };
