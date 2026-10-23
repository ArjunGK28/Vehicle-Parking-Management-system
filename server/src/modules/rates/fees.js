// FR-09: fee = billed time x hourly rate.
// Time is rounded up to the next billing step, so with a 15-minute step a 45-minute stay
// bills 45 minutes and a 46-minute stay bills 60. The minimum fee covers short and
// zero-length stays. Fees are whole rupees, rounded up.
//   calculateFee(90 * 60, { hourlyRate: 30, minimumFee: 10, billingStepMinutes: 15 })
//   -> { billedMinutes: 90, amount: 45 }
function calculateFee(durationSeconds, { hourlyRate, minimumFee, billingStepMinutes }) {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new Error(`calculateFee needs a duration of 0 seconds or more, got ${durationSeconds}`);
  }

  const steps = Math.ceil(durationSeconds / (billingStepMinutes * 60));
  const billedMinutes = steps * billingStepMinutes;
  const amount = Math.max(minimumFee, Math.ceil((hourlyRate * billedMinutes) / 60));
  return { billedMinutes, amount };
}

module.exports = { calculateFee };
