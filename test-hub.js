

async function run() {
  const workerUrl = "https://clash-manager-worker.onrender.com";
  const auth = "REMOTE_WORKER_SECRET";
  const bustUrl = `${workerUrl}/hub/state?v=${Date.now()}`;
  
  const workerResponse = await fetch(bustUrl, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${auth}`,
      "Content-Type": "application/json"
    }
  });
  
  const workerPayload = await workerResponse.json();
  const hhTable = workerPayload.data.data.headhunter;
  console.log("HH length:", hhTable.length);
  console.log("Row 0:", hhTable[0]);
  console.log("Row 1:", hhTable[1]);
  console.log("Row 2:", hhTable[2]);
}

run().catch(console.error);
