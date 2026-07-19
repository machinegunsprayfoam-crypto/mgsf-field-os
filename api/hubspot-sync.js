const HUBSPOT_BASE = "https://api.hubapi.com";
const getHeaders = () => ({ "Authorization": `Bearer ${process.env.HUBSPOT_API_KEY}`, "Content-Type": "application/json" });

async function findContact(email) {
  const r = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/search`, {
    method: "POST", headers: getHeaders(),
    body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: email }] }] })
  });
  const d = await r.json();
  return d.results && d.results.length > 0 ? d.results[0] : null;
}

async function createOrUpdateContact(lead) {
  const existing = await findContact(lead.email);
  const props = {
    firstname: lead.firstName || "",
    lastname: lead.lastName || "",
    email: lead.email, phone: lead.phone,
    hs_lead_status: lead.score >= 75 ? "IN_PROGRESS" : "NEW",
    lifecyclestage: "lead",
    city: lead.city, state: lead.state
  };
  if (existing) {
    await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts/${existing.id}`, {
      method: "PATCH", headers: getHeaders(), body: JSON.stringify({ properties: props })
    });
    return existing.id;
  }
  const r = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/contacts`, {
    method: "POST", headers: getHeaders(), body: JSON.stringify({ properties: props })
  });
  const d = await r.json();
  return d.id;
}

async function createDeal(contactId, lead) {
  const r = await fetch(`${HUBSPOT_BASE}/crm/v3/objects/deals`, {
    method: "POST", headers: getHeaders(),
    body: JSON.stringify({
      properties: {
        dealname: `${lead.location || lead.city} - Spray Foam Estimate`,
        dealstage: "presentationscheduled",
        amount: lead.estimateValue || 0,
        pipeline: "default",
        closedate: new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0]
      },
      associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 3 }] }]
    })
  });
  return r.json();
}

async function syncLeadToHubSpot(lead) {
  try {
    const contactId = await createOrUpdateContact(lead);
    const deal = await createDeal(contactId, lead);
    return { success: true, contactId, dealId: deal.id };
  } catch(e) { return { success: false, error: e.message }; }
}

module.exports = { syncLeadToHubSpot, findContact };

module.exports.handler = async (req, res) => {
  if (req.method === "POST") {
    const result = await syncLeadToHubSpot(req.body);
    return res.json(result);
  }
  res.json({ status: "HubSpot Sync API online" });
};
