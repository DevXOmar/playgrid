import http from "k6/http";
import { check } from "k6";
import exec from "k6/execution";
import { Counter } from "k6/metrics";

export const successCount = new Counter("booking_successes");
export const conflictCount = new Counter("booking_conflicts");

export const options = {
  scenarios: {
    race: {
      executor: "shared-iterations",
      vus: 100,
      iterations: 100,
      maxDuration: "20s"
    }
  },
  thresholds: {
    booking_successes: ["count==1"],
    booking_conflicts: ["count==99"]
  }
};

const BASE_URL = __ENV.BASE_URL || "http://localhost:4000";
const TOKEN = __ENV.TOKEN;
const SLOT_ID = __ENV.SLOT_ID;

export default function () {
  const res = http.post(
    `${BASE_URL}/bookings`,
    JSON.stringify({ slotId: SLOT_ID }),
    {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${TOKEN}`,
        "Idempotency-Key": `k6-${SLOT_ID}-${exec.scenario.iterationInTest}`
      }
    }
  );
  check(res, {
    "success or deterministic conflict": (r) => r.status === 201 || r.status === 409
  });
  if (res.status === 201) successCount.add(1);
  if (res.status === 409) conflictCount.add(1);
}

export function handleSummary(data) {
  return { stdout: JSON.stringify({ requests: data.metrics.http_reqs, successes: data.metrics.booking_successes, conflicts: data.metrics.booking_conflicts }, null, 2) };
}
