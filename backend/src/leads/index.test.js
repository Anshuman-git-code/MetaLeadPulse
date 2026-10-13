const { normalizeLead } = require('./index');

const makeMetaLead = (overrides = {}) => ({
    id: '780674821807675',
    created_time: '2026-10-08T08:20:43+0000',
    field_data: [
        { name: 'full_name', values: ['Rahul Sharma'] },
        { name: 'email', values: ['rahul@example.com'] },
        { name: 'phone_number', values: ['+91 9876543210'] },
    ],
    ...overrides,
});

test('normalizes a complete lead correctly', () => {
    const result = normalizeLead(makeMetaLead());
    expect(result.id).toBe('780674821807675');
    expect(result.name).toBe('Rahul Sharma');
    expect(result.email).toBe('rahul@example.com');
    expect(result.phone).toBe('+91 9876543210');
    expect(result.createdAt).toBe('2026-10-08T08:20:43+0000');
});

test('returns empty string for missing phone', () => {
    const result = normalizeLead(makeMetaLead({
        field_data: [
            { name: 'full_name', values: ['Priya'] },
            { name: 'email', values: ['priya@test.com'] },
        ]
    }));
    expect(result.phone).toBe('');
    expect(result.name).toBe('Priya');
});

test('uses Unknown for missing name', () => {
    const result = normalizeLead(makeMetaLead({ field_data: [] }));
    expect(result.name).toBe('Unknown');
    expect(result.email).toBe('');
});

test('throws if input is null', () => {
    expect(() => normalizeLead(null)).toThrow('must be a non-null object');
});

test('throws if id is missing', () => {
    expect(() => normalizeLead({ field_data: [] })).toThrow('missing an id');
});

test('converts numeric id to string', () => {
    const result = normalizeLead(makeMetaLead({ id: 780674821807675 }));
    expect(typeof result.id).toBe('string');
});