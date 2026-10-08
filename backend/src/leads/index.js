// ─────────────────────────────────────────────────────────────────────────────
// leads/index.js — Lead normalization module
//
// This module transforms Meta's raw Graph API response into the application's
// internal Lead model — the shape that the rest of the system works with.
//
// WHY a separate module:
// Meta's API returns field_data as an array of { name, values } objects.
// That structure is Meta-specific. The React Native app (and anything else
// consuming leads) shouldn't need to know or care about Meta's format.
// This module is the translation boundary — it speaks both "Meta" and
// "our application". If Meta changes their response format, only this
// file needs to update.
//
// HOW it is used:
// webhook/index.js calls retrieveLead() from meta/index.js to get raw data,
// then passes that raw data into normalizeLead() from this module.
// The result is an application-level Lead object ready for Socket.IO emission.
// ─────────────────────────────────────────────────────────────────────────────


// ─────────────────────────────────────────────────────────────────────────────
// findField — helper to extract a value from Meta's field_data array
// ─────────────────────────────────────────────────────────────────────────────
// Meta's field_data looks like this:
//   [
//     { name: 'full_name',    values: ['Rahul Sharma'] },
//     { name: 'email',        values: ['rahul@example.com'] },
//     { name: 'phone_number', values: ['+91 9876543210'] }
//   ]
//
// To get the email, we search for the object where name === 'email',
// then return values[0] (the first/only value in the array).
//
// Parameters:
//   fieldData  — the field_data array from Meta's response
//   fieldName  — the Meta field name to look for (e.g. 'full_name')
//
// Returns:
//   The first value as a string, or an empty string '' if not found.
//   We use '' instead of undefined/null so the Lead object always has
//   a consistent shape — no field is ever missing, just possibly empty.
// ─────────────────────────────────────────────────────────────────────────────
function findField(fieldData, fieldName) {
    // Array.find() searches through the array and returns the first object
    // where the condition is true. If nothing is found, it returns undefined.
    const field = fieldData.find((f) => f.name === fieldName);

    // If the field exists and has values, return the first value.
    // The optional chaining operator ?. means: if field is undefined,
    // don't crash — just return undefined and the || '' fallback kicks in.
    return field?.values?.[0] || '';
}


// ─────────────────────────────────────────────────────────────────────────────
// normalizeLead — convert Meta API response to application Lead model
// ─────────────────────────────────────────────────────────────────────────────
// This is the only exported function from this module.
//
// What it does:
//   Takes Meta's raw Graph API response object and maps it to our Lead shape.
//
// Parameters:
//   metaLead — the raw object returned by retrieveLead() in meta/index.js
//
// Returns:
//   A plain object matching the Lead type defined in mobile/src/app/index.tsx:
//   {
//     id:        string   — the leadgen_id
//     name:      string   — from Meta's 'full_name' field
//     email:     string   — from Meta's 'email' field
//     phone:     string   — from Meta's 'phone_number' field (may be empty)
//     createdAt: string   — ISO timestamp string
//   }
//
// WHY field names differ between Meta and our model:
//   Meta uses 'full_name'    → we use 'name'
//   Meta uses 'phone_number' → we use 'phone'
//   Meta uses 'created_time' → we use 'createdAt'
//   These differences are handled here so no other part of the system
//   needs to know Meta's naming conventions.
//
// WHY we handle missing fields:
//   Not every lead form collects every field. A form might collect only
//   email and name, with no phone. findField() returns '' for missing fields
//   so the Lead object always has all keys — just some may be empty strings.
//   The React Native app already handles empty phone (it checks before
//   rendering the phone line).
// ─────────────────────────────────────────────────────────────────────────────
function normalizeLead(metaLead) {

    // Destructure the top-level fields from Meta's response.
    // id           — the leadgen_id as a string
    // created_time — ISO timestamp like "2026-10-08T08:20:43+0000"
    // field_data   — the array of form fields the person submitted
    //
    // We use || [] as a fallback for field_data in case Meta returns
    // a lead with no form fields (edge case, but safe to handle).
    const { id, created_time, field_data = [] } = metaLead;

    // Build and return the normalized Lead object.
    // This shape matches the Lead type in mobile/src/app/index.tsx exactly.
    return {
        id:        String(id),                           // ensure it's a string
        name:      findField(field_data, 'full_name'),   // Meta calls it full_name
        email:     findField(field_data, 'email'),
        phone:     findField(field_data, 'phone_number'), // Meta calls it phone_number
        createdAt: created_time,                         // keep as ISO string
    };
}


// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────
module.exports = { normalizeLead };
