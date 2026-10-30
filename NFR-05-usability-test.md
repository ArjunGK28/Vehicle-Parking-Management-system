# NFR-05 usability check (issue #52)

Requirement: a trained attendant completes a normal entry within 1 minute (UC-05).

## What the automated tests show

`e2e/attendant-entry-usability.spec.js` (run in Chrome, Edge and Firefox) checks that:

- login to the slot shown on screen, as a script, takes far less than 1 minute
- the entry screen has one field, the cursor is already in it, and Enter submits
- 10 entries in a row work, and after each one the field is empty and focused
- a typing mistake shows "Vehicle not found", keeps the text, and a corrected entry works
- Enter on an empty field says "Enter a registration number"

A script is faster than a person, so this proves the screen is simple and the system adds
only a small part of the minute. It does not prove how fast a person is. Use the test below.

## Definitions

- **Trained attendant:** a person who has had one 10-minute walkthrough of the Vehicle entry
  screen and has done 2 practice entries.
- **Normal entry:** a registered vehicle, a free slot of its type, the attendant already logged in.
  The attendant types the registration number from a paper note.
- **Time:** from "Go" (note handed over, Vehicle entry screen open) to the moment the slot
  code ("Go to P-xx") is on screen. Use a stopwatch.
- **Pass:** every timed entry is 60 seconds or less.

## Procedure

1. Prepare the demo data: `npm run db:reset`, `npm run db:seed`, register a driver and add 6 vehicles.
2. Log in as the attendant on the Vehicle entry page.
3. Give the tester a note with one registration number. Say "Go", start the stopwatch.
4. Stop when the slot code is shown. Write the time down.
5. Repeat for 3 entries per tester, with 3 or more testers. Use a different browser for one tester.
6. Add one extra entry per tester with a deliberate typing mistake. This is for information only.

## Results

| Tester | Role/experience | Entry 1 (s) | Entry 2 (s) | Entry 3 (s) | Entry with mistake (s) | Notes |
|---|---|---|---|---|---|---|
| | | | | | | |
| | | | | | | |
| | | | | | | |

Slowest normal entry: ____ s     Result (all <= 60 s): pass / fail     Date: ____     Run by: ____

If any entry is over 60 seconds, write down where the time went (finding the field, typing,
waiting for the system) and raise an issue.