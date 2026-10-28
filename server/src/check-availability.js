// NFR-03: measures availability by polling the health endpoint of a running server.
//   node server/scripts/check-availability.js [url] [--minutes 60] [--interval 10] [--timeout 5]
// Run it during operating hours (for example the whole 06:00 to 22:00 window).
// A check passes only if /api/health answers 200 with status "ok" within the timeout.
// Prints the availability percentage and exits with 1 if it is below 99%.
const TARGET_PERCENT = 99;

function readArgs(argv) {
  const options = { url: 'http://localhost:4000', minutes: 60, interval: 10, timeout: 5 };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const value = Number(args[i + 1]);
      if (!(key in options) || key === 'url' || !Number.isFinite(value) || value <= 0) {
        console.error(`Usage: node check-availability.js [url] [--minutes N] [--interval SECONDS] [--timeout SECONDS]`);
        process.exit(2);
      }
      options[key] = value;
      i += 1;
    } else {
      options.url = arg.replace(/\/+$/, '');
    }
  }
  return options;
}

async function checkOnce(url, timeoutSeconds) {
  try {
    const res = await fetch(`${url}/api/health`, { signal: AbortSignal.timeout(timeoutSeconds * 1000) });
    const body = await res.json().catch(() => ({}));
    return res.status === 200 && body.status === 'ok' ? null : `HTTP ${res.status}`;
  } catch (err) {
    return err.name === 'TimeoutError' ? 'timed out' : err.message;
  }
}

async function main() {
  const { url, minutes, interval, timeout } = readArgs(process.argv);
  const endsAt = Date.now() + minutes * 60 * 1000;
  let total = 0;
  let failed = 0;
  let stopping = false;

  function report() {
    const up = total - failed;
    const percent = total === 0 ? 0 : (up / total) * 100;
    console.log(`Availability: ${percent.toFixed(2)}% (${up} of ${total} checks passed, target ${TARGET_PERCENT}%)`);
    process.exitCode = total > 0 && percent >= TARGET_PERCENT ? 0 : 1;
  }

  process.on('SIGINT', () => {
    stopping = true;
  });

  console.log(`Checking ${url}/api/health every ${interval}s for ${minutes} minutes. Press Ctrl+C to stop early.`);
  while (!stopping && Date.now() < endsAt) {
    const problem = await checkOnce(url, timeout);
    total += 1;
    if (problem) {
      failed += 1;
      console.log(`${new Date().toISOString()}  DOWN  ${problem}`);
    }
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
  }
  report();
}

main();