# NFR-08 cross-browser check (issue #50)

All main flows must work in Chrome, Edge and Firefox.

## Automated run

`e2e/main-flows.spec.js` runs the same 5 flows in all three browsers:

1. A new driver registers, logs in and registers a vehicle (UC-01, FR-02)
2. An attendant records entry, sees the slot Occupied, finds the vehicle and records exit (UC-05, UC-03, UC-07, UC-08)
3. A driver sees a finished stay in parking history (UC-11)
4. An administrator adds a slot, opens the rates page and adds a user (UC-12)
5. Pages are protected and log out ends the session (NFR-10, NFR-11)

    npm run e2e:install      # once: downloads Firefox for the tests
    npm run e2e              # builds the client, then runs all three browsers
    npx playwright test --project=chrome   # one browser (chrome, edge or firefox)

Chrome and Edge are the copies installed on the computer. The tests use the `parking_test`
database, so do not run them at the same time as `npm test`.

## Manual check (what the script cannot judge)

Open `http://localhost:5173` (or the built app on port 4000) in each browser and tick each line.
Look at layout and readability, not only whether it works.

| Check | Chrome | Edge | Firefox |
|---|---|---|---|
| Login and register pages look correct, errors show under the fields | | | |
| Dashboards for driver, attendant and admin show all tiles | | | |
| Slot availability: colours for the 4 statuses, filters, auto-refresh | | | |
| Vehicle entry: field has focus on opening, Enter submits, slot shown | | | |
| Vehicle exit: fee and summary table readable | | | |
| Parking history: table fits, paging buttons work | | | |
| Admin pages: slots, rates, users tables readable | | | |
| Window narrowed to phone width: no sideways scrolling of the page | | | |
| Dark mode (system setting): text readable on all pages | | | |

## Result

| Browser | Version | Date | Automated run (pass/fail) | Manual check (pass/fail) | Tester |
|---|---|---|---|---|---|
| Chrome | | | | | |
| Edge | | | | | |
| Firefox | | | | | |

Not covered: Safari and mobile browsers (not in NFR-08).