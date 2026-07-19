// api/jobs-sync.js — Supabase Real-Time Job Persistence (Improvement #2)
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function createJob(job) {
  const { data, error } = await supabase.from("jobs").insert([{
    job_number: job.jobNumber,
    customer_name: job.customerName,
    customer_email: job.customerEmail,
    customer_phone: job.customerPhone,
    location: job.location,
    job_type: job.jobType,
    sqft: job.sqft,
    estimate_value: job.estimateValue,
    status: "scheduled",
    crew_assigned: job.crew,
    start_date: job.startDate,
    created_at: new Date().toISOString()
  }]).select();
  if (error) return { success: false, error };
  return { success: true, job: data[0] };
}

async function updateJobStatus(jobId, status, crewUpdate) {
  const { data, error } = await supabase.from("jobs").update({
    status,
    last_crew_update: crewUpdate,
    updated_at: new Date().toISOString(),
    ...(status === "completed" ? { completed_at: new Date().toISOString() } : {})
  }).eq("id", jobId).select();
  if (error) return { success: false, error };
  
  // Trigger invoice if completed
  if (status === "completed") {
    await triggerInvoiceFlow(data[0]);
  }
  return { success: true, job: data[0] };
}

async function getActiveJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .in("status", ["scheduled", "in_progress", "weather_delay"])
    .order("start_date", { ascending: true });
  return { jobs: data || [], error };
}

async function triggerInvoiceFlow(job) {
  // Calls billing agent when job completes
  try {
    await fetch(`${process.env.VERCEL_URL}/api/billing`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate_invoice", job })
    });
  } catch(e) { console.error("Invoice trigger failed:", e); }
}

module.exports = { createJob, updateJobStatus, getActiveJobs };

module.exports.handler = async (req, res) => {
  const { method, body, query } = req;
  if (method === "GET") {
    const result = await getActiveJobs();
    return res.json(result);
  }
  if (method === "POST" && body.action === "create") return res.json(await createJob(body.job));
  if (method === "POST" && body.action === "update") return res.json(await updateJobStatus(body.jobId, body.status, body.crewUpdate));
  res.json({ status: "Jobs Sync API online" });
};
