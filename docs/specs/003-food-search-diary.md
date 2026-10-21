# Spec 003: Food search and diary

Status: **Approved at Gate 1 (human, 2026-10-21) with all open-question defaults (section 8), including the split into 003a (AC 1–38, 48–51) and 003b (AC 39–47). Design section drafted 2026-10-21, awaiting Gate 2.**
Branch: `feat/003-food-search-diary` (spec drafted on `docs/003-food-search-diary`). Roadmap: Milestone 1, item 003. Product spec: F2 (diary by meal, daily summary), F3 (food search with serving units); N9 only as far as section 6 says (offline is 010).
Depends on: 001 (merged: targets, effective-dated `daily_targets`, Today first landing, consent) and 002 (**not merged yet**; this section was written against the 002 documents and the access-module contract on branch `feat/002-food-db-import`; the architect re-checks every 002 detail below against what actually merges). 011 (attribution page) gates all Open Food Facts data, see AC 17.
Sections below the Product section (Design, Technical plan, QA report, reviews) are filled in by later stages.

---

# Product

## 1. Problem and target user

After 001 a new user lands on a Today screen that shows a target and nothing to fill it with, and after 002 the food catalogue exists but nothing reads it. This feature joins the two: the user finds a food, says how much they ate, and sees the day add up against their target. That is the daily loop the whole product rests on: PRODUCT_SPEC §1 says "logging speed is the product" and §4 sets the beta exit criterion that a user can log a full day in under 60 seconds. The target user is the same as 001: someone aged 16 or older, tracking for fat loss, muscle, sport or plain awareness, who may be sensitive about food and numbers, in an English-speaking market or in Italy. Italy is a launch market, so Italian food names appear as published and typing Italian everyday words ("pane", "riso", "uovo") has to work, but the app UI stays English until localisation (Milestone 3).

The feature has two halves with very different risk. **The diary** (store, show, edit and total what was eaten) is the core of the product and carries the health-data obligations: consent, row-level security, deletion and export coverage, and the promise that history never changes when the catalogue does. **The search quality** (ranking, everyday-word aliases, Italian words, speed) decides whether logging feels fast or frustrating, and 002 deliberately left it open: 002 only guarantees the rows exist and ships a functional trigram baseline. Open question 1 recommends shipping them as two PRs, 003a (diary and adding from the baseline search) then 003b (search quality). Every acceptance criterion below is tagged `[a]` or `[b]` for that split.

Facts this section relies on (from the 002 documents on `feat/002-food-db-import`, read 2026-10-21; **not yet merged**):
- The client reads foods only through `apps/mobile/src/lib/foodData.ts` (`getFoods`, `lookupBarcode`, `searchFoods`), backed by the `public` RPCs `get_foods`, `lookup_barcode` and `search_foods(p_query, p_limit, p_include_off)`. `search_foods` takes 1 to 100 characters, returns at most 50 rows (default 20), and returns only visible canonical rows. Its current ordering is trigram similarity, which 002 calls "a functional baseline for AC 50 only"; 003 owns ranking and may replace the body while keeping the signature.
- Each food has nutrients per 100 g: energy (kcal), protein, carbs and fat always present, and fibre, sugars, saturated fat and sodium (mg) that may be **unknown** (null), which is different from a real 0. It also has a display name and its language (`en` or `it`), an optional brand, up to 10 named servings `{label, grams}`, a tier (`verified`, `brand`, `community`) and a carbs basis (`total`, `available`, `unknown`).
- `includeOff` is `false` until backlog item 011 ships, so no Open Food Facts (OFF) derived food may reach a user before then (002 AC 44). With `includeOff` false, a USDA row whose barcode cluster has an OFF canonical member is currently **not returned by search** (backend note, 002 B1/B2, deviation 3).
- Hidden foods (superseded, removed upstream, over budget) are never searched but still resolve by id. No user table has a foreign key into the catalogue (ADR 0006), and the food data budget of about 300 MB includes any index 003 adds (ADR 0008, with 25 bytes per row reserved).
- 001 gives `daily_targets` (effective-dated, user-local `YYYY-MM-DD`), `targetForDate(rows, date)`, `localDateIn(timeZone)`, `profiles.units` and `profiles.timezone`. ADR 0005: every RPC that writes health data takes `p_give_consent`.

## 2. User stories

1. As someone logging breakfast, I want to type "banana" or "oats" and see the right food first so that I can log it without scrolling.
2. As someone logging a usual meal, I want to add a food in one tap at its usual serving, and change the amount only when it is different, so that a whole day takes under a minute.
3. As someone who weighs food, I want to enter grams (or ounces if I use imperial units), and as someone who does not, I want to pick "1 medium" or "1 cup" so that the amount matches how I actually eat.
4. As someone logging for the day, I want to see calories and macros against my target, and what is left, after every entry so that I know where I am without doing sums.
5. As a user who made a mistake, I want to change an amount, move an entry to another meal, or delete it (and undo the delete) so that the diary matches what I ate.
6. As a user who forgot to log yesterday, I want to open any past day and add or edit entries there so that my history is complete.
7. As a user whose targets changed last week, I want yesterday's ring to still show the target I had yesterday so that my past does not rewrite itself.
8. As a user in Italy, I want to type "riso", "pane" or "latte" and find the everyday food, and to see Italian packaged products with their Italian names once they are available, so that the app works in my language of eating.
9. As a user comparing nutrition, I want a nutrient that is not listed to show as "not listed", not as 0 g, so that I am not misled.
10. As a user with a history of disordered eating, I want neutral wording around my totals, no red warnings and no scolding when I go over or under so that logging does not feel like being judged.
11. As a user on a plane or with a bad connection, I want to be told clearly when something could not be saved, and not lose what I typed, so that I can retry when I have signal.
12. As a user with a privacy concern, I want my diary protected by my consent, visible only to me, deleted with my account and absent from analytics so that my eating stays private.
13. As the data owner (the founder), I want search that stays under 300 ms and inside the database size budget so that the free plan holds through beta.

## 3. Acceptance criteria

Numbering is stable; the QA stage maps each criterion to a test. Tags: `[a]` ships in 003a (diary and adding from search), `[b]` ships in 003b (search quality); if the human declines the split (question 1) they ship together. Test layers: **unit** (pure functions in `packages/shared` or the app: totals, scaling, units, dates, query handling), **component** (React Native Testing Library, rendered states and copy), **pgTAP** (schema, RLS, RPC behaviour), **integration** (app against a local Supabase loaded with the 002 fixture), **Maestro** (end-to-end flows on iOS/Android/web), **browser** (QA runs the web build at 390x844 and 375x667 and looks at the screens; 001 showed that rendering bugs pass unit tests), **release check** (operator runs on the full real data before beta; not in CI).

Definitions. "Entry" is one logged food in the diary. "Core four" is energy (kcal), protein, carbs and fat. "Optional nutrients" are fibre, sugars, saturated fat and sodium. "Snapshot" is the set of values and descriptive fields copied onto an entry at the moment it is logged. "Diary date" is a local `YYYY-MM-DD` string chosen when the entry is logged. "Viewed date" is the day shown on the Today screen. "Day relation" is one of `today`, `yesterday`, `past`, `tomorrow`. Thresholds below are product defaults that the architect may express as configuration.

### Diary day view `[a]`
1. **Today shows the day.** Given a signed-in user who completed onboarding and has no entries today, when Today opens, then it shows the date label "Today", the calorie summary with 0 consumed and the full target left, the protein, carbs and fat summary (0 of target grams each), and four meal sections in the order Breakfast, Lunch, Dinner, Snacks, each empty with an add action. This replaces the placeholder card of 001 screen S8. *(component, browser)*
2. **Totals are exact sums.** Given a day whose entries have stored kcal 105.0, 210.4 and 56.3, when the summary renders, then consumed kcal is 372 (the sum of the stored values, rounded half up once, not the sum of rounded entries), left is the target minus the displayed consumed value, and each meal section shows its own kcal subtotal computed the same way. Protein, carbs and fat grams are totalled and shown the same way, to whole grams in the summary. *(unit for the arithmetic; component for the display)*
3. **Over target is neutral.** Given consumed kcal above the target, when the summary renders, then it states the difference in plain words ("240 kcal above your target"), the bar or ring is shown full, no danger or red colour is used, nothing is announced as an alert, and no message tells the user to eat less. The same neutral treatment applies to macros above their target. *(component; copy test, see AC 50)*
4. **Under target says nothing extra.** Given a day with few or no entries (for example 200 kcal at 9 pm), when the summary renders, then it shows the numbers only: no warning, no praise, no suggestion to eat more or less. *(component)*
5. **The target in effect for that date.** Given `daily_targets` rows effective 2026-10-01 (1,800 kcal) and 2026-10-19 (1,600 kcal), when the user views 2026-10-18, 2026-10-19 and 2026-10-25, then the summary uses 1,800, 1,600 and 1,600 respectively. Given a viewed date earlier than the first `effective_from`, then the summary shows consumed values only with the line "No target was set for this day" and no ring fill. Editing targets later never changes how a past day displays. *(unit with `targetForDate`; component)*
6. **Loading and failure never look like zero.** Given the day's entries have not loaded or failed to load, when Today renders, then it shows a loading state or an error state with Retry, and never shows "0 kcal" or "Add breakfast" as if the day were empty. *(component; integration with a failing request)*
7. **Date navigation.** Given Today, when the user taps previous day, next day, the date label (opens a date picker) or "Today", then the viewed date changes accordingly, labelled "Today", "Yesterday", "Tomorrow", or otherwise like "Mon 19 Oct" (plus the year when it is not the current year). The earliest date is 2020-01-01 and the latest is tomorrow; beyond these the control is disabled with an accessible hint. Date arithmetic is done on date strings, so it is correct across month ends, the leap day 2028-02-29 and daylight-saving changes (2026-03-29 and 2026-10-25 in Europe/Rome; 2026-11-01 in America/New_York). *(unit with parametrised dates; component)*
8. **Midnight rollover.** Given the user is viewing "Today" when the local clock passes midnight (or the app returns to the foreground after midnight), when the app next refreshes, then Today shows the new date; given the user was viewing a specific past date, then that date stays. A sheet that is already open keeps the date it was opened for until it closes. *(unit with a fake clock; component)*
9. **Travelling.** Given an entry logged for 2026-10-21 in Europe/Rome and the device then moves to America/New_York (or the reverse), when the user opens 2026-10-21, then the entry is still there and unchanged, and "today" is the date on the device's current clock. No entry is ever moved to another date because the timezone changed, and logging does not change `profiles.timezone`. *(unit; integration)*
10. **Past and tomorrow are editable.** Given any viewed date inside the allowed range, when the user adds, edits or deletes entries, then it works exactly as on Today. An empty past day shows "Nothing logged for this day" and the add actions, with no wording about missed days. *(component, integration)*

### Adding food from search `[a]`
11. **Entry points and defaults.** Given Today, when the user taps the add action of a meal section, then the Add food sheet opens with that meal selected; when the user taps the general "Add food" action, then the meal is preselected from the local time (04:00 to 10:29 Breakfast, 10:30 to 14:29 Lunch, 14:30 to 16:59 Snacks, 17:00 to 21:59 Dinner, 22:00 to 03:59 Snacks) and can be changed in the sheet. The entry date is the viewed date, and the sheet header shows the date whenever it is not today. The sheet has Search only; Describe, Scan and Photo are not shown until their features ship (question 14). *(component, Maestro)*
12. **Search states.** Given the Add food sheet in Search mode, then it shows, in turn: an initial state (the field focused, a one-line hint, no result list); fewer than 2 characters (the hint stays, no request); loading (a skeleton or spinner after 200 ms, never a blank flash); results; no results; and error (AC 14). *(component)*
13. **Result rows.** Given results, when the list renders, then each row shows the food name (at most two lines, ellipsis after that), the brand when there is one, the default serving and its energy ("1 medium (118 g) · 105 kcal"), and the tier label text "Verified", "Brand" or "Community" (names fixed in 002; badge styling and explainers are 009). The name is shown as published: Italian names stay Italian, and a result found through an alias (AC 41, 43) still shows its real name, never a translated or invented one. The default serving is the food's first named serving, or "100 g" when it has none. A name of 200 characters, one with emoji, or one with diacritics renders without breaking the layout, at the largest Dynamic Type size too. *(component with fixtures: a 200-character name, "Crème caramel", "Passata di pomodoro", a food with no servings)*
14. **Search request behaviour.** Given the user types, when keystrokes arrive faster than 250 ms apart, then one request is sent for the settled text; a response for an older query that arrives after a newer one is ignored; a failed request shows "Couldn't search right now. Check your connection and try again." with Retry, keeps the typed text, and keeps the previous results hidden rather than stale. *(unit with fake timers; component)*
15. **Query handling.** Given any input, then before the request the text is trimmed, repeated whitespace is collapsed, and it is cut to 100 characters (the field also stops accepting characters after 100, without an error message); an empty or one-character query sends no request. The query text is never stored by the app or the database and never appears in analytics or logs (AC 51). *(unit; pgTAP/architecture test that no table or log column stores query text)*
16. **Tier and source on every result.** Given the access module returns rows, then each shown row has a tier label; rows with hidden status are never shown in search results. *(component; pgTAP on the RPC)*
17. **No OFF data before 011.** Given `includeOff` is false, when searching, then no row with source `off` is returned or shown, even if one reaches the client (the module drops it too), and the diary shows OFF-derived entries only if they were logged after 011 shipped. The switch is a single constant owned by 011. *(unit on the module; pgTAP with an OFF fixture row; architecture test)*
18. **Food detail and amount.** Given the user taps a result (not its quick-add button), when the detail opens, then it shows the name, brand, tier label and the estimates line, with a serving picker (every named serving, labelled "label (N g)" or "(N oz)" for imperial users, plus "g", plus "oz" for imperial users), a quantity field starting at 1 serving (or 100 g for the grams option), a meal picker, and the live result for the chosen amount: kcal large and protein, carbs and fat in grams. The primary action says what will happen: "Log · 105 kcal". The quantity accepts a dot or a comma as decimal separator, at most two decimals; the total amount must be at least 0.1 g and at most 10,000 g; anything else shows an inline message ("Enter an amount from 0.1 g to 10,000 g", in the user's unit) and disables the action. *(unit for parsing and limits; component; browser)*
19. **Metric and imperial.** Given `profiles.units`, then amounts are stored in grams in both systems; metric users see g and imperial users see oz (1 oz = 28.3495 g) wherever a weight is shown or typed; named servings keep their published label with the gram weight beside it converted to the user's unit; per-serving values are not affected by units. An entry logged as "5 oz" is stored as 141.7 g and reopens as "5 oz" (the choice and the typed number are kept, not recomputed from grams, so it never reopens as "4.9 oz"). Changing units in Settings changes how existing entries display with no data change. *(unit with round-trip cases at 0.1, 1, 5, 16, 100 oz; component)*
20. **Scaling and rounding.** Given a fixture food with, per 100 g, 89 kcal, 1.1 g protein, 22.8 g carbs, 0.3 g fat and a serving "1 medium" of 118 g, then 1 serving is 105.0 kcal, 1.3 g protein, 26.9 g carbs, 0.4 g fat; 1.5 servings is 157.5 kcal (shown as 158, half up); 200 g is 178.0 kcal. Stored values keep one decimal; displayed kcal are whole numbers; macros show one decimal in the detail and entry views and whole grams in the summary. *(unit)*
21. **Unknown is not zero.** Given a food whose sodium is unknown and whose fibre is exactly 0, when the detail or an entry shows optional nutrients, then sodium shows "-" with the label "Not listed" and fibre shows "0 g"; the snapshot keeps null for sodium and 0 for fibre; no daily total of an optional nutrient is shown in this feature. *(unit; component)*
22. **Carbs basis is disclosed.** Given a food whose carbs basis is `available`, then the detail and entry views show the line "Carbs on this label don't include fibre"; given `total`, "Carbs include fibre"; given `unknown`, no line. Daily totals add carbs as published and carry no basis note (question 11). *(component)*
23. **Logging an entry.** Given a valid amount, when the user taps "Log", then one entry is created for the sheet's date and meal, the day summary updates, the sheet stays open on the Search state with a one-line tally ("Added 2 items · 340 kcal") and a "Done" action, and Done closes the sheet and shows the updated day. Closing the sheet with an unlogged amount typed asks to discard it (existing Sheet behaviour). *(component, integration, Maestro)*
24. **One-tap add.** Given a result row, when the user taps its add button, then one entry is created for the default serving (quantity 1) in the sheet's meal and date, with a confirmation that includes "Undo" for 5 seconds; tapping Undo removes that entry. The add button has its own accessible name ("Add [name], 105 kilocalories"), and the rest of the row opens the detail. *(component, integration)*
25. **The snapshot.** Given an entry is logged, then it stores: the food id (no foreign key), the display name, brand, name language, source, tier and carbs basis of the food as shown, the amount in grams, the serving label and quantity (or the unit the user typed), and the eight nutrient values for that amount (kcal, protein, carbs, fat, fibre, sugars, saturated fat, sodium) with null for unknown, plus the diary date, meal, `origin` = `search` and a client-generated id. The entry is displayed from this snapshot alone and never reads the catalogue. *(pgTAP for the table shape; unit for snapshot building)*
26. **Logging is idempotent.** Given the user double-taps "Log" or the app retries a save whose first attempt actually succeeded, then exactly one entry exists, because the client id is reused for the retry. *(pgTAP duplicate insert with the same id; component with a double tap)*
27. **Limits are enforced where it counts.** Given a modified client, when it tries to store an entry with a meal other than the four allowed, a date before 2020-01-01 or more than two days after the server's UTC date (tomorrow in the most advanced timezone), an amount below 0.1 g or above 10,000 g, a negative nutrient, or a 201st entry on one date for one user, then the server rejects it with a specific error and nothing is stored; the app shows a calm message ("This day is full. Remove an entry to add another." for the daily limit). *(pgTAP)*
28. **Consent.** Given a user whose health-data consent is missing (for example withdrawn in Settings), when they try to log, then the write is refused with `consent_required`, the consent prompt from 001 appears, accepting retries the save in the same request, and declining leaves nothing stored and the typed amount on screen. Behaviour after consent withdrawal for existing entries is decided by 001a. *(pgTAP; component)*

### Editing and deleting entries `[a]`
29. **Open an entry.** Given an entry in the diary, when the user taps it, then an edit sheet shows its name, brand, tier label, amount (as logged: serving and quantity, or grams/oz), meal, nutrient values and the estimates line, all from the snapshot, with no network request for the food. *(component; integration with the network mocked to fail)*
30. **Edit the amount.** Given an entry, when the user changes the quantity or serving and saves, then the entry's nutrients are rescaled from the values snapshotted at logging time (proportionally to the new amount), not re-read from the catalogue: if the catalogue food has since changed or been hidden, the edited entry still uses the old per-100 g basis. The day summary updates. *(unit; pgTAP or integration with a changed catalogue row)*
31. **Change the meal.** Given an entry, when the user selects another meal and saves, then it moves to that meal on the same date and the subtotals update. *(component, integration)*
32. **Delete and undo.** Given an entry, when the user deletes it (swipe or a Delete button, no confirmation dialog), then it disappears, the summary updates, and "Removed. Undo" is offered for 5 seconds; Undo restores the same entry with the same id, meal and values. *(component, integration)*
33. **History is untouched by catalogue changes (002 AC 32).** Given an entry whose snapshot was taken from food F, when F is updated by an import (new nutrients), or hidden (`removed_upstream`, `superseded`, `over_budget`), then the entry's stored values are byte-for-byte unchanged, the day totals are unchanged, and the entry opens and edits normally with no "no longer listed" marker (marking hidden foods belongs to recents and favourites, 005). There is no foreign key or trigger between the catalogue and the diary. *(pgTAP; this is the test 002 handed over)*
34. **Removed or changed elsewhere.** Given an entry that was deleted from another device while this one still shows it, when the user edits or deletes it, then the app says "This entry was already removed" (calm, not an error), refreshes the day, and creates nothing. *(integration)*

### Privacy, access, deletion `[a]`
35. **Own rows only.** Given two users A and B, when A reads, inserts, updates or deletes entries, then only A's rows are visible and changeable; A cannot insert a row with B's `user_id`, cannot change an entry's `user_id`, and an unauthenticated session sees nothing. *(pgTAP; RLS is required by CLAUDE.md)*
36. **Deletion and export coverage.** Given a user deletes their account, then all their diary entries are removed with it, and the table is covered by the deletion-coverage test required by 001a (AC 9 there); the table's columns are listed for the export (F15) schema. No diary content (names, amounts) appears in server or client logs. *(pgTAP; log check in integration)*

### Offline and errors `[a]`
37. **Writes fail loudly, never silently.** Given the device is offline or the server errors, when the user logs, edits or deletes an entry, then an inline, non-blocking message says it could not be saved yet ("Couldn't save that yet. Check your connection and try again."), offers Retry, and keeps what the user typed or tapped on screen; nothing is shown as saved. Queueing writes to send later is not part of this feature (item 010). *(component, integration)*
38. **Reads while offline.** Given the device goes offline, when the user views a day already loaded in this session, then the day shows with a small "Offline" notice; given a day that was never loaded, then the error state of AC 6 appears. Search needs a connection (the catalogue is too large for the device). *(component)*

### Search quality `[b]`
39. **Matching basics.** Given the fixture catalogue, then search ignores case and diacritics ("caffe" finds "Caffè", "creme" finds "Crème brûlée"), treats singular and plural alike ("egg" and "eggs"), ignores word order ("breast chicken"), and tolerates one typo in words of five or more letters ("bananna"). Apostrophes, hyphens and commas in names do not stop a match ("olio d'oliva", "olio d oliva"). *(pgTAP or integration with the 002 fixture; unit for query normalisation)*
40. **Ranking.** Given two foods that both match, then the one whose name starts with the query or contains it as a whole word ranks above one where it appears only inside a word; on equal match quality, `verified` ranks before `brand` before `community`, and among verified foods Foundation before SR Legacy before FNDDS; remaining ties go to the shorter name, then a stable id order, so repeated searches give identical order. A brand named in the query ("kellogg corn flakes") boosts that brand. *(pgTAP; unit for the ordering function)*
41. **Everyday words (aliases).** Given the checked-in alias list (a reviewed file in the repo, drafted from Appendix A), when the user types an everyday name that differs from the catalogue name ("chicken breast", "skim milk", "oatmeal", "white rice", "greek yogurt"), then the intended food is in the top 3. Each alias maps to a stable catalogue food (by dataset and source reference, as the golden list does); a test fails if an alias points at a food that is missing from the fixture or if two aliases collide. Aliases only influence ranking: they never change a food's displayed name. *(unit for the file; pgTAP/integration for the results)*
42. **Golden search list, English.** Given the English queries of Appendix A, then each query's expected food appears in the top 5 results and at least 90 percent have it in the top 3, on the fixture (CI) and on the full real data (release check, rerun after each USDA release). *(integration; release check)*
43. **Italian everyday words.** Given the Italian queries of Appendix A ("pane", "riso", "uovo", "latte", "mozzarella", "olio d'oliva", ...), then each query's expected generic USDA food appears in the top 5 and at least 80 percent in the top 3, and the result shows its English catalogue name as published. Italian packaged products found by name (for example "passata di pomodoro") are returned when `includeOff` is true in the test, and stay dark in the app until 011. *(integration; the OFF case with `includeOff` set in the test only; release check)*
44. **A food with a USDA twin stays findable.** Given a barcode cluster whose canonical member is OFF and which has a visible USDA member, when `includeOff` is false, then search returns the USDA member (the same rule `lookup_barcode` already follows). *(pgTAP with the 002 cross-source fixture)*
45. **Hostile and odd queries.** Given the queries `%`, `_`, `\`, `'`, `"`, `100%`, `a`, `   `, an emoji, a string of punctuation, and a 100-character name copied from the catalogue, then none produces an error, none matches the whole catalogue, `%` and `_` behave as literal characters, and the long copied name returns that food first. *(pgTAP; unit)*
46. **Speed.** Given the full real beta data (about 300 MB of food data) and the golden queries plus 200 random two-to-twelve-letter queries, then the search request's p95 is under 300 ms round trip from a device in the beta region on a normal mobile connection, and the server-side query time p95 is under 150 ms. The result is written into the spec's QA section. *(release check, run by the operator; a CI smoke test on the fixture catches gross regressions only)*
47. **Size.** Given 003b adds search indexes or alias storage, then the importer's size report shows the `food` schema within the 300 MB budget plus 10 percent tolerance (ADR 0008), and the added bytes per row are reported. *(release check)*

### Cross-cutting
48. **Logging speed (the core promise).** Given the golden day of five foods (for example eggs, toast, banana, chicken breast with rice, coffee), when a tester logs them from the Today screen using search and one-tap add, then each food after the first takes at most two interactions (type, tap add), the first takes at most four (open sheet from a meal, type, tap add), and the whole day is logged in under 60 seconds in a timed run on a mid-range Android device. *(Maestro counts the interactions; one timed manual run is recorded in the QA report)*
49. **Accessibility.** Given a screen reader and Dynamic Type at the largest size, then: the day summary is read as one sentence ("1,240 of 1,800 kilocalories logged, 560 left"), meal sections are headings, result rows and entries have full labels (name, amount, kcal, tier), the add button, undo, retry and delete are reachable and named, status changes (added, removed, error) are announced politely, every touch target is at least 44 pt, nothing relies on colour alone, and on web the sheet closes with Escape and results are reachable by keyboard (arrows, Enter). *(component with accessibility queries; browser; manual VoiceOver/TalkBack pass)*
50. **Copy.** Given the strings of this feature, then none contains a word from the banned list in section 7, a test over the string resources enforces it, and the copy in the approved Design section is used verbatim. *(unit over strings)*
51. **Analytics.** Given the events in section 5, when each action happens, then exactly one event with only the listed properties is emitted, and no event contains a food name, food id, brand, query text, an exact date, an amount, a calorie or macro value, or a count of calories. *(unit with a recording analytics sink)*

## 4. Out of scope (explicit)

- Describe (natural-language), Scan and Photo modes of the Add food sheet: Describe is 008, Scan is 004, Photo is Milestone 2. Typing a barcode number into the search field is also 004's (manual barcode entry).
- Recent, frequent and favourite foods, search history, copy meal from yesterday, "log it again" (005). The initial search state is therefore empty apart from the hint.
- Custom foods, "create a food" and quick-add of raw calories and macros (006). The no-results state does not offer to create a food yet.
- Badge and tier UI beyond the three label words, explainers, "report a wrong value", duplicate merging by name (009).
- Offline-first behaviour: local database, outbox, queued writes, conflict handling and background sync (010). Section 6 defines only the minimum.
- Showing any Open Food Facts food, and the attribution page (011).
- Water, exercise, weight, steps, and any "calories burned" adjustment of what is left (F8, F9, 007).
- Per-meal goals, custom meal names or more than four meals, net-carbs mode, macro percentages (F12), meal reminders and notifications.
- Daily totals or views of fibre, sugars, saturated fat, sodium and micronutrients, weekly reports and charts (F14).
- Moving an entry to another day, copying entries, notes, photos or times on entries, sharing a diary.
- Streaks, badges, gamification, a "hide numbers" mode and the "Fix my day" action on empty meals (N4). The Track Day canvas shows a streak badge on Today; this feature does not (question 8).
- Entering liquids in millilitres (no density data yet, 002 AC 12). Servings that are published in ml keep their labels with their gram weight.
- Editing the catalogue, "update this entry to the latest values", swapping the food of an existing entry (delete and re-add instead).
- Search filters, sort options, voice search, semantic or LLM-assisted search (008), embeddings.
- The UI translation (Milestone 3) and translating food names. Search understands Italian words, results show names as published.
- The bottom tab bar and its "+" button, and widgets: the designer decides how Today is reached; this feature only needs the add actions of AC 11.
- Delete-account and export screens (001a, F15); this feature only has to be covered by them (AC 36).
- Server-side verification of the snapshot against the catalogue (a modified client can store values that the catalogue would not produce; this only affects its own data, as in ADR 0004).

## 5. Analytics events

All events carry the standard anonymous user id and platform provided by the analytics layer and nothing else identifying. They carry no food name, food id, brand, search text, exact date, amount, calorie or macro value, and no free text. Property values are enumerations or buckets. They follow the analytics consent that 001a introduces; until then, the same rule as the 001 events.

| Event | Properties | Fires when |
|---|---|---|
| `diary_viewed` | `day_relation`: `today`, `yesterday`, `past`, `tomorrow`; `entry_count_bucket`: `0`, `1_3`, `4_8`, `9_plus`; `has_target`: boolean | A day finishes loading on Today (once per day shown) |
| `diary_date_changed` | `method`: `previous`, `next`, `picker`, `today_button` | The viewed date changes by the user |
| `add_food_opened` | `entry_point`: `meal_row`, `add_button`, `empty_state`; `meal`: `breakfast`, `lunch`, `dinner`, `snacks`; `day_relation` | The Add food sheet opens |
| `food_search_performed` | `query_length_bucket`: `2_3`, `4_8`, `9_plus`; `result_count_bucket`: `0`, `1_5`, `6_20`, `21_plus`; `latency_bucket`: `lt_300`, `300_1000`, `gt_1000`; `outcome`: `results`, `no_results`, `error` | A search request settles |
| `food_result_selected` | `rank_bucket`: `1`, `2_3`, `4_10`, `11_plus`; `source`: `usda`, `off`; `tier`; `action`: `open_detail`, `quick_add` | The user taps a result or its add button |
| `diary_entry_added` | `meal`; `day_relation`; `source`; `tier`; `via`: `quick_add`, `detail`; `amount_kind`: `serving`, `grams`, `ounces`; `seconds_since_sheet_open_bucket`: `lt_10`, `10_30`, `30_60`, `gt_60` | An entry is saved successfully |
| `diary_entry_edited` | `changed`: list of `amount`, `meal` | An edit is saved successfully |
| `diary_entry_deleted` | `via`: `swipe`, `button` | A delete succeeds |
| `diary_entry_delete_undone` | none | Undo restores an entry |
| `add_food_closed` | `entries_added_bucket`: `0`, `1`, `2_4`, `5_plus`; `duration_bucket`: `lt_30s`, `30_120s`, `gt_120s` | The sheet closes |
| `diary_write_failed` | `action`: `add`, `edit`, `delete`; `reason`: `offline`, `server`, `validation`, `consent_required`, `day_full` | A write fails |

Success measures for this feature: median seconds from opening the sheet to the first saved entry (target under 20), the share of days with a logged entry that were completed in under 60 seconds of sheet time, the share of searches with `no_results` (target under 10 percent excluding queries of 9 or more characters), the share of selections at rank 1 to 3 (target at least 80 percent, this is the ranking quality signal in production), search latency distribution (p95 under 300 ms), `diary_write_failed` rate (target under 1 percent of writes), and entries added per active day. Day-level adherence to the calorie target is deliberately not measured.

## 6. Edge cases

- **Offline:** search needs a connection, as the catalogue (about 270 MB) never syncs to the device. Writes do not queue in this feature; they fail visibly with Retry and the screen keeps the user's input (AC 37). A day already loaded can be read offline in the same session; nothing is persisted across app restarts for offline use (010). A request that fails halfway is safe to retry because entry ids are client-generated (AC 26). If the app is killed between tapping Log and the response, the entry may or may not exist; the day view after restart is the truth.
- **Empty states:** a first-ever day (no entries, no history): the Search state shows the hint and nothing else, no "recent foods". A search with no results: "No match for [text]. Try fewer words or another spelling." (the text is shown on screen only). A past day with nothing: "Nothing logged for this day". A meal section without entries: its add action only. A user with no target for that date: consumed values only (AC 5).
- **Errors:** every network failure has an inline message with Retry and never empties the screen or shows zeros (AC 6, 14, 37). A rejected write (limits, consent) says what to do. The server error codes are not shown to the user.
- **Units:** storage is grams; the UI shows g or oz by `profiles.units` (AC 19). Published serving labels ("1 cup", "1 fl oz") are shown as published and not converted; the gram figure beside them is. The per-100 g reference in the detail stays "per 100 g" in both systems because that is how labels are written. Liquids are entered by serving or grams (1 ml = 1 g in the data, 002 AC 12); a user who types 250 g for 250 ml of milk is off by about 3 percent, accepted. Typing "1,5" or "1.5" both mean one and a half; displayed numbers use the English formatting the app already uses.
- **Timezone and date boundaries:** the diary date is a plain local date string, chosen when logging and never recomputed. "Today" is the date on the device's clock in the device's current timezone (question 3). Logging at 23:58 for "today" and saving at 00:01 keeps the date the sheet was opened for (AC 8). Daylight-saving days have 23 or 25 hours and are irrelevant because nothing is computed from hours (AC 7). Flying east or west never loses or duplicates a day's entries (AC 9); a user can end up with two different "Today"s only in the sense that the date on the clock changed. The date range is 2020-01-01 to tomorrow, so users in timezones ahead of UTC never hit a future-date error (AC 27 allows tomorrow in any timezone).
- **Unknown vs zero:** the core four are never unknown (002 rejects rows without them). Optional nutrients are null or a number; null shows "-" and "Not listed", 0 shows "0 g" (AC 21). Totals of the core four are exact; null optional nutrients are not summed anywhere in this feature.
- **Carbs basis:** a day can mix foods published with and without fibre in carbs, so the carb total can differ from the "true" figure by that day's fibre. The entry and detail views disclose each food's basis; the total stays as published (002 question 4, option b).
- **Hidden, removed or changed foods:** diary entries never depend on the catalogue (AC 25, 29, 33); a hidden food is still correct on the day it was logged. A hidden food that is still open in a result list or detail can still be logged, because the values are already on screen. A food that exists only as OFF (before 011) is simply not findable (AC 17); Italian beta testers will not find Italian packaged products until 011 flips `includeOff` (question 10).
- **Very long or odd names:** names up to 200 characters, brands up to 120: two lines with ellipsis in lists, full text wrapped in the detail and entry views; ALL CAPS is already normalised by the importer; emoji, apostrophes, `&`, `%` and diacritics display as stored; names are never translated or shortened.
- **Italian names and words:** Italian names are stored as published (`name_lang` = `it`) and shown as is, next to English USDA names, in the same list. Search accepts Italian everyday words through aliases (AC 41, 43). Accents are optional in the query (AC 39). Quantity input accepts a decimal comma (AC 18).
- **Duplicates:** logging the same food twice creates two entries (a user may eat two apples at different times); there is no merging. Near-identical USDA names (Foundation versus SR Legacy) are ordered, not hidden (AC 40).
- **Amounts:** 0, negative, non-numeric, more than two decimals, empty and pasted text are all rejected with an inline message; 10,000 g is the maximum; the smallest accepted amount is 0.1 g.
- **Limits:** at most 200 entries per day per user (AC 27). A day with 200 entries still scrolls smoothly and the summary stays pinned or at the top (designer decides).
- **Concurrency:** two devices editing the same entry: the last save wins (ARCHITECTURE: last-write-wins per entry); an entry deleted elsewhere shows the calm message of AC 34. Real conflict handling is 010.
- **Foods without servings:** a food with no named servings offers grams (or oz) only; its default is 100 g.
- **Sheet dismissal:** closing with an unlogged, edited amount asks to discard; closing after logging does not. A system back gesture behaves the same as the close button.
- **Past-day edits and targets:** editing an old entry changes that day's totals against that day's target (AC 5); it never changes any other day.
- **Consent withdrawn mid-session:** the next write asks for consent again (AC 28); reads are 001a's call.
- **Rapid typing, slow networks:** older responses never overwrite newer ones (AC 14). Typing during the loading state is never blocked.
- **Web:** the same flows work with mouse and keyboard; the sheet is a dialog on wide screens (design system); no native-only API is required.

## 7. Copy guidelines

Voice follows Track Day: short, active, numbers first, coach not judge. Eating-disorder sensitivity is a hard requirement: this feature shows the user's intake against a number, which is exactly where harm happens. The rules:

- **Banned words and ideas** (a test enforces the words, AC 50): cheat, bad, good (about food or days), clean, dirty, junk, guilty, earn, deserve, reward, treat (as a reward), splurge, indulge, binge, burn off, allowed, "budget", "blown", "off track", "on track" (as praise), failed, behind, "over budget", "perfect day", "free food". No before-and-after framing, no comparison with other people, no "you ate too much / too little".
- **Totals are descriptive.** "1,240 kcal left", "240 kcal above your target". No colour that signals failure or success (no red for over, no green for under); volt marks progress only, as in the design system. No celebration or scolding at any intake level, including very low or very high days. Do not show weight-status words.
- **Missing data is not a lapse.** An empty meal says "Add breakfast", not "Nothing yet" in a tone of absence; an empty past day says "Nothing logged for this day". Never "You missed" or "You forgot".
- **Estimates, not facts.** The detail and entry views carry "Values are estimates. Check the label if you want to be sure." Never "exact", "accurate", "guaranteed", "healthy", "unhealthy", "clean". No medical claims. Food data credits stay in 011.
- **Tier labels** are exactly "Verified", "Brand", "Community" (fixed in 002 section 7). Explainer text and styling are 009's. A Community food is described by where it comes from, never as "unreliable".
- **Unknown nutrient:** "Not listed" (never "0", "none" or "missing").
- **Search:** hint "Search foods" or similar (designer's call); no results "No match for [text]. Try fewer words or another spelling." Error "Couldn't search right now. Check your connection and try again."
- **Writes:** success is quiet (a tally line, not a toast party). Failure "Couldn't save that yet. Check your connection and try again." Removed "Removed. Undo". Daily limit "This day is full. Remove an entry to add another." Entry gone "This entry was already removed."
- **Labels name results:** "Log · 105 kcal", "Done", "Add [name], 105 kilocalories", "Undo", "Retry". Meal names: Breakfast, Lunch, Dinner, Snacks.
- **Italian users** see English UI copy in this version; food names may be Italian. Do not machine-translate any string or food name.
- All visible copy is final only after the designer and a sensitivity review; this section sets the rules and examples.

## 8. Open questions for the human

Each has a recommended default. If you approve the spec without answers, the defaults stand.

1. **Split into 003a and 003b?** 001 showed that large PRs slow review, and this feature spans a new health-data table, three screens and a search rewrite. **Default: yes.** 003a is the diary: `diary_entries` with RLS and consent, the Today day view, date navigation, the Add food sheet with Search on 002's baseline `search_foods`, detail and amount, one-tap add, edit, delete, undo, offline minimum, analytics (AC 1 to 38, 48 to 51). 003b is search quality: matching, ranking, aliases (English and Italian), the USDA-twin fix, hostile queries, speed and size validation on full data (AC 39 to 47). 003a goes first because the diary is the core of the product and works acceptably with English generic queries; 003b follows before inviting beta testers, and before any Italian tester. If you decline the split, one PR carries both, and the architect will say whether it fits.
2. **Date range and future days.** **Default:** viewable and editable from 2020-01-01 to tomorrow; no logging further ahead. Reason: planning ahead is out of scope, and a long future range invites pre-logging. Alternative: allow up to 7 days ahead.
3. **Which timezone defines "today"?** The device's current timezone, or `profiles.timezone` (captured at onboarding and only updated when the user re-saves their profile, 001)? **Default: the device's current clock and timezone.** Entries keep the date they were logged for and never move; the stored profile timezone is not changed by logging. It matches what the user sees on their wall clock when travelling. Consequence: `daily_targets.effective_from` was written in the profile timezone, so around a trip the target's effective date can differ by a day from the diary's; AC 5 reads targets by date string only, so no day goes without a target except before the very first row.
4. **Logging model of the sheet.** The Track Day pattern ends with a button such as "Log 3 items · 662 kcal" (a staged basket), which suits Describe mode (008). **Default for Search: write immediately, one entry per tap, keep the sheet open with a tally and Undo (AC 23, 24).** It is fastest, loses nothing if the app dies, and needs no basket state. The designer may show a staged list if the human prefers; that changes AC 23.
5. **One-tap add on result rows, and the default serving.** **Default: yes**, adding quantity 1 of the first named serving (else 100 g). It is how five foods fit in 60 seconds. Risk: a wrong default serving ("1 cup, shredded") gets logged without a look; mitigated by the serving and kcal shown on the row and by Undo. For the golden list, 002 already names the expected serving.
6. **How is "over target" shown?** **Default:** neutral text ("240 kcal above your target"), the bar full, no warning colour, no alert announcement (AC 3). To be reviewed by the designer and in a sensitivity review before beta.
7. **A "hide numbers" mode** for users for whom counting is harmful. **Default: not in 003**, but the sensitivity review should decide before public launch (M2) whether it, a gentler summary, or a pointer to professional help belongs in Settings. Recorded here because the summary is where this is felt.
8. **Streak badge on Today (shown on the canvas).** **Default: not in 003.** Streaks reward unbroken logging and punish missed days, which is a risk for people sensitive about food. The north-star metric (days logged per weekly active user) can be reported without showing it. Needs your call and the designer's.
9. **Offline minimum.** **Default:** no queued writes, visible failure with Retry, read-only use of days loaded in the session (AC 37, 38); everything else is 010. Alternative: persist the day's entries on the device now; I advise against it, because it would duplicate 010's design.
10. **Italian users before 011.** With `includeOff` false, Italian beta users find only USDA generics (English names, Italian words through aliases) and no Italian packaged products. **Default: accept for 003 and sequence 011 immediately after 003a, before Italian testers join**, and fix search so that a USDA twin of an OFF canonical row stays findable (AC 44). Alternative: flip `includeOff` earlier with a minimal attribution line; that needs your licence decision (002 question 5).
11. **Carbs basis in the day total.** **Default:** disclose per food (AC 22), no note on the total. Alternative: a footnote on the total when the day mixes `total` and `available` foods. I recommend adding it only if beta testers are confused, since it adds a caveat to every Italian day.
12. **Alias list: size, owner, review.** **Default:** a reviewed JSON file in the repo, covering the English golden list (about 100 foods) and about 60 Italian words; the PM drafts from Appendix A, the human skims the Italian terms (you know the beta users' vocabulary), no automatic translation and no LLM at query time. Extra aliases are added from `no_results` rates and rank buckets after beta starts.
13. **Search speed target and how it is measured.** **Default:** p95 under 300 ms round trip on a normal mobile connection in the beta region and under 150 ms server-side, both on full-size data, measured by the operator before beta (AC 46). If the Free plan cannot meet it, options in order: a leaner index and a lower result limit, then a cache or the second-project fallback of 002 question 1; the architect proposes, the human decides.
14. **Add food sheet tabs.** **Default:** show only Search until Describe, Scan or Photo exist, with no disabled "coming soon" tabs. Alternative: show the full segmented control with the others disabled; the designer to choose.
15. **Limits and result count.** **Default:** minimum 2 characters, 25 results, no paging, 10,000 g per entry, 200 entries per day, five-second undo. Cheap to change; stated so they are testable.
16. **Meal defaults by time of day (AC 11).** **Default:** the windows in AC 11, a fixed rule, no learning from the user's habits (that would be a later personalisation feature).

## Appendix A: draft golden search queries

Drafts by the PM for the human to skim (as for the 002 golden list). Expected foods are descriptions; the tests map each to a catalogue id once the fixture and the real data exist. Every expected food should also exist in the 002 golden list or its Italian staples; where it does not, 003b adds it to that list.

English (expected food in the top 5, at least 90 percent in the top 3): egg (Egg, whole, raw); eggs; boiled egg (Egg, whole, hard-boiled); banana (Bananas, raw); apple (Apples, raw, with skin); chicken breast (Chicken, breast, meat only, cooked); raw chicken breast; rice (Rice, white, cooked); white rice; brown rice (cooked); oats; oatmeal (Oats, cooked with water or Oats, raw); whole milk; skim milk (Milk, nonfat); butter; olive oil; cheddar (Cheese, cheddar); salmon (Fish, salmon, Atlantic); potato; sweet potato; broccoli; lentils (cooked); peanut butter; black coffee (Coffee, brewed); white bread; whole wheat bread; greek yogurt (Yogurt, Greek, plain); avocado; tomato; pasta (Pasta, cooked); ground beef (Beef, ground); bacon; almonds; tuna (Fish, tuna, canned); tofu; orange juice; honey; sugar.

Italian (expected generic USDA food in the top 5, at least 80 percent in the top 3; the result shows its English name): pane (Bread, white or wheat); riso (Rice, white, cooked); pasta (Pasta, cooked); latte (Milk, whole); latte intero; uovo and uova (Egg, whole); mela (Apples); banana; pollo and petto di pollo (Chicken, breast); manzo and macinato di manzo (Beef, ground); mozzarella (Cheese, mozzarella); parmigiano (Cheese, parmesan); ricotta; formaggio (any Cheese); prosciutto crudo (Ham, cured or prosciutto); prosciutto cotto (Ham, cooked); olio d'oliva and olio extravergine (Oil, olive); pomodoro and pomodori (Tomatoes); patate; carote; zucchine (Squash, summer, zucchini); spinaci (Spinach); lattuga (Lettuce); tonno (Fish, tuna); salmone; lenticchie; ceci (Chickpeas); fagioli (Beans); yogurt; burro (Butter); zucchero (Sugar); miele (Honey); caffe and caffè (Coffee, brewed); biscotti (Cookies); gelato (Ice cream); birra (Beer); vino rosso (Wine, red).

Italian packaged products (tested only with `includeOff` true until 011): "passata di pomodoro", "pasta barilla" style brand-plus-name queries, "nutella"-style brand-only queries, "caffè" with an accent against unaccented data. Real product names come from the 30-barcode Italian list of 002 AC 4b.

---

# Design

Status: **drafted 2026-10-21, awaiting Gate 2 (human design approval).** Scope: 003a (AC 1–38, 48–51). 003b (AC 39–47) adds no screens; where search quality changes what a result row or the no-results state shows, it is noted inline (S3, S4). Design system: Track Day v1 (`docs/design/DESIGN_SYSTEM.md`, `packages/ui/src/tokens.ts`, `apps/mobile/src/components/ui/`). This extends the 001 screens that shipped (S8 Today first landing, `Sheet`, `Stepper`, `Notice`, `MacroTrio`, `LaneBar`, `Choice`, `Tag`) instead of replacing them. Proposed design-system changes are in D7 and are **not** yet in DESIGN_SYSTEM.md.

Approved defaults this design follows (Gate 1, section 8): every tap writes immediately and the sheet stays open with a tally and Undo (no staged "Log N items"); one-tap add uses the first named serving, else 100 g; over target is neutral text with no red and no alert; no streak badge; no "hide numbers" mode; the Add food sheet shows Search only (no tabs); the device clock defines today; range 2020-01-01 to tomorrow; meal preselected by the AC 11 windows; offline = no queued writes, visible failure and Retry, read-only for loaded days; carbs basis per food only; limits 2 chars, 25 results, 10,000 g, 200 entries a day, 5 s Undo.

Example numbers: target 1,800 kcal, 104 g protein, 200 g carbs, 60 g fat. Banana = 89 kcal, 1.1 / 22.8 / 0.3 g per 100 g, first serving "1 medium" 118 g → 105 kcal (AC 20).

## D1. User flow

### Entry points (map to `add_food_opened.entry_point`)
| Control on Today | Opens Add food with | `entry_point` |
|---|---|---|
| "+" in a meal section header | that meal | `meal_row` |
| Dashed "Add breakfast" button in an empty meal section | that meal | `empty_state` |
| Pinned "ADD FOOD" button at the bottom of Today | meal from the AC 11 time window | `add_button` |

All three open on the viewed date. The search field is focused on open, so the keyboard is already up and typing needs no extra tap.

### Happy path A: log one food at its usual serving (new or returning user, breakfast, Today)
1. Today → tap "+" on BREAKFAST. *(1)* The sheet opens, meal = Breakfast, search field focused.
2. Type "banana". *(2: one typing interaction)* Results appear after the 250 ms debounce.
3. Tap "+" on "Bananas, raw · 1 medium (118 g) · 105 kcal". *(3)* **The entry is saved here.** Tally "Added 1 item · 105 kcal", Undo bar for 5 s, light haptic, the query text is selected so the next keystroke replaces it.
4. Tap "DONE". *(4)* Sheet closes; Today shows Breakfast 105 kcal and 1,695 kcal left.

**Tap count: 3 interactions to saved, 4 to back on Today.** Swiping the sheet down instead of Done also works (nothing is dirty), with the same count.

### Happy path B: log one food with a different amount
Open from meal *(1)* → type *(2)* → tap the row *(3)* → choose a serving chip or type in the amount field (Stepper ± or typing) *(4, sometimes 5)* → "LOG · 158 KCAL" *(5–6)*, back on Search with the tally → Done *(6–7)*.

### Happy path C: the golden day (AC 48, the under-60 s promise)
Logged in one sitting in the evening. The pinned ADD FOOD preselects Dinner (17:00–21:59), so the user switches meal inside the sheet with a chip instead of closing and reopening (that saves one tap per meal change). "Chicken breast with rice" is two searches.

| # | Action | Interactions | Running |
|---|---|---|---|
| 1 | Tap "+" on BREAKFAST | 1 | 1 |
| 2 | Type "eggs", tap "+" | 2 | 3 |
| 3 | Type "toast", tap "+" | 2 | 5 |
| 4 | Type "coffee", tap "+" | 2 | 7 |
| 5 | Tap meal chip "Snacks" | 1 | 8 |
| 6 | Type "banana", tap "+" | 2 | 10 |
| 7 | Tap meal chip "Dinner" | 1 | 11 |
| 8 | Type "chicken breast", tap "+" | 2 | 13 |
| 9 | Type "rice", tap "+" | 2 | 15 |
| 10 | Tap DONE | 1 | 16 |

**Golden day = 16 interactions for 6 foods (14 if counted as the AC's 5 foods), estimated 40 to 50 s** (about 3 s typing + 2 s reading + 1 s tap per food on a mid-range Android, plus result latency). Logged meal by meal through the day (open from each meal, then Done), it is 2 extra interactions per meal: 4 + 2 + ... = 18, still well under 60 s because each sitting is short.

What makes the 2-interaction rule hold:
- **The query is selected after every add** (not cleared): the next keystroke replaces it, and the results stay on screen so a second item from the same list (for example a second food from "rice" results) is one tap. A "Clear search" button is in the field for anyone who prefers it.
- **The keyboard stays open** across adds (taps on rows don't dismiss it on iOS/Android; `keyboardShouldPersistTaps="handled"` is already on the Sheet's ScrollView).
- **The meal chip row stays in the sheet** so moving to the next meal is 1 tap, not Done + reopen (2).

### Taps challenged or reinterpreted
1. **AC 48 wording ("each food after the first takes at most two interactions").** True only within the same meal. A meal change costs 1 more (chip), and closing costs 1 (Done). Proposed AC 48 text: "each further food in the same meal ≤ 2 interactions, a meal change inside the sheet ≤ 1, closing ≤ 1; the golden day ≤ 18 interactions and < 60 s". Maestro counts against that.
2. **"2 eggs" is one tap on "+" twice, which creates two entries** (duplicates are allowed, spec §6). The alternative is tap row → "+" on the stepper → Log (3 taps, one entry). I kept both; no quantity selector on the row, because it would add a control to every row for a minority case. Flagged in D8 for after beta ("+" long-press to pick a quantity).
3. **AC 18, switching from a serving to "g".** The AC says the field then starts at 100 g. That changes the amount (and the kcal on the Log button) just because the user changed the unit. **Design: convert instead** ("1 medium" → "118 g", "1.5 × 1 medium" → "177 g"; oz likewise), with the number selected so typing replaces it. Fewer surprises, same tap count. Needs approval (D8).
4. **AC 24/32 Undo for 5 seconds** conflicts with WCAG 2.2.1 (timing adjustable) for screen-reader and switch users. **Design:** 5 s by default; the timer pauses while the Undo bar has focus or hover; with a screen reader running, the bar stays until the next action or until the sheet closes. Undo is never the only way back (the entry can always be deleted from Today), so this is a convenience, not a lock-in.
5. **No confirmation on delete (AC 32)** kept: Undo covers it, a dialog would cost a tap on every delete.
6. **Detail "Back" with a changed amount does not ask to discard.** Re-picking an amount is cheaper than a dialog. Only closing the whole sheet from a dirty detail page asks (AC 23).

### Branches
- **Edit an entry:** Today → tap entry *(1)* → change serving, quantity or meal *(1–2)* → "SAVE · 158 KCAL" *(1)*. 3–4 taps.
- **Delete:** swipe the entry left fully *(1)* (native), or tap entry → "Delete entry" *(2)*. "Removed. Undo" on Today.
- **Past day:** "‹" on Today *(1 per day)* or the date label → date picker *(2–3)*, then the same flows. "Today" returns in 1 tap.
- **Write fails (offline/server):** Notice with "Try again" in the sheet; the tapped food or typed amount stays. Retry reuses the client id (AC 26).
- **Consent missing:** the 001 consent page is pushed inside the sheet; "I AGREE" saves the pending entry in the same step (AC 28); "NO THANKS" returns with the amount on screen.

## D2. Screens

Shared rules: 20 pt gutter, 480 pt max column on wide web, `Card` radius 14, all numbers `tabular-nums`. Food names use the proposed `foodName` type (D7) and are **never upper-cased**, translated or shortened except for the line clamps below. Names with `name_lang = it` carry the Italian language tag for screen readers (D5).

### S1. Today (diary day view). Replaces 001 S8.

Layout, top to bottom (scrolls as one; only the ADD FOOD button is pinned):
1. **Date header (`DateNav`, new):**
   - Row 1: eyebrow (`label`, muted) with the full date, "WED 21 OCT" (plus the year when not the current year: "MON 19 OCT 2025").
   - Row 2: the day name as a button (`display`): "TODAY", "YESTERDAY", "TOMORROW", or "MON 19 OCT". Tapping it opens the date picker (S9). On its right, two 44 pt glyph buttons "‹" (previous day) and "›" (next day).
   - When the viewed date is not today, a text `Button` "Today" appears on row 1, right-aligned.
   - The 001 greeting "Hi {name}" moves to row 1 on Today only: "HI SAM · WED 21 OCT". (Keeps what shipped without spending a line.)
2. **Status line** (only when it applies): `Notice` info "Offline. You're seeing what was already loaded." (S1 offline), or the one-off 001 line "Plan saved. Let's get going." (accent, first landing only).
3. **Day summary card** (`Card`, composition of existing parts):
   - Label "CALORIES".
   - Hero: `numberXL` in `accentText` "560", then `label` "KCAL LEFT".
   - Line (`body`): "1,240 of 1,800 kcal logged".
   - `LaneBar` (10 segments), value = logged ÷ target, `valueText` "1,240 of 1,800 kilocalories logged".
   - `MacroTrio` in the proposed `progress` variant (D7): "62 / 104 g PROTEIN", "120 / 200 g CARBS", "40 / 60 g FAT"; the 3 pt data-colour rule becomes a thin bar filled in proportion (track behind).
4. **Past empty day line** (only on a past day with no entries): `bodyRegular`, muted, "Nothing logged for this day".
5. **First-time hint** (only until the user's first entry ever): `small`, muted, "Tap + on a meal to log your first food."
6. **Four `MealSection`s (new)**, in order Breakfast, Lunch, Dinner, Snacks, 24 pt apart:
   - Header row: title (`title`, heading role) "BREAKFAST", subtotal (`number`, muted) "420 kcal" (hidden when empty), and a 44 pt "+" button (accentText outline, label "Add to breakfast").
   - Entries (`EntryRow`, new), in the order logged, divided by `track` hairlines. Each: name (`foodName` small size, max 2 lines, ellipsis), detail line (`small`, muted) "1 medium (118 g)" / "150 g" / "5 oz", right column kcal (`number`) "105" above `label` "KCAL". Whole row ≥ 56 pt, tappable (opens S6). Native swipe-left reveals a "Delete" action.
   - Empty section: a full-width dashed button (56 pt, `border` dashed 1.5, radius 12, `body` text) "Add breakfast" / "Add lunch" / "Add dinner" / "Add snacks". This replaces the canvas "Fix my day" (N4 is out of scope).
7. Secondary `Button` "Profile & settings" (as shipped).
8. Bottom spacer equal to the pinned button height, so the last row is never covered.
9. **Pinned:** primary `Button` "ADD FOOD" (56 pt) above the bottom safe area, on a `background` strip.

States:
- **Loading (entries or target not loaded yet, AC 6):** the date header is live. The card shows `Skeleton` blocks (hero block, one line, the lane bar in `trackEmpty`, three macro blocks); four meal headers show titles only, with no subtotal, no "+", no dashed buttons and no "0". ADD FOOD is hidden. Accessibility: one element "Loading your day". The skeleton appears after 200 ms; before that, nothing below the header (no flash).
- **Error (entries failed):** `Notice` danger "Couldn't load this day. Check your connection and try again." with action "Try again". No card, no meals, no ADD FOOD. Date navigation stays usable.
- **Partial: entries loaded, target failed:** the card shows the logged total as the hero ("1,240" + "KCAL LOGGED"), macros as plain grams, no lane bar, and a `Notice` info inside the card "Couldn't load your target for this day." with "Try again". Meals and ADD FOOD work.
- **Partial: target loaded, entries failed:** same as Error (totals without entries would look like zero).
- **Empty today (first-time):** hero "1,800" KCAL LEFT, "0 of 1,800 kcal logged", empty lane, macros "0 / 104 g" etc., four dashed buttons, the first-time hint, and on the very first landing the 001 "Plan saved" line.
- **Empty today (returning):** the same without the hint and the "Plan saved" line.
- **Empty past day:** as above plus "Nothing logged for this day". No wording about missed days.
- **Under target (any amount, any time):** numbers only (AC 4). No praise or prompt.
- **At target exactly:** hero "0" KCAL LEFT, bar full. No message.
- **Over target (AC 3):** the hero switches to the logged total so no large number is about the excess: `numberXL` "2,040" + `label` "KCAL LOGGED"; line "240 kcal above your target"; lane bar full in the normal volt; no danger colour, no icon, no announcement. A macro over target shows "116 / 104 g", the rule full, and a muted line "12 g above". (Decision in D8: alternative is a hero "240" + "KCAL ABOVE YOUR TARGET".)
- **No target for this date (before the first `effective_from`, AC 5):** hero logged total + "KCAL LOGGED", line "No target was set for this day", no lane bar, macros as plain grams "62 g".
- **Offline with the day loaded (AC 38):** the status line Notice above; everything readable; actions stay enabled, and a write shows the AC 37 failure (connection detection is unreliable, so actions are not disabled pre-emptively).
- **Offline, day never loaded:** the Error state.
- **Tomorrow:** "›" disabled (announced "Next day, unavailable. Tomorrow is the latest day you can log."). Same for "‹" on 2020-01-01 ("1 Jan 2020 is the earliest day you can log.").
- **Day full (200 entries):** all add actions stay visible; pressing one shows `Notice` info "This day is full. Remove an entry to add another." on Today instead of opening the sheet. Long lists scroll; the summary scrolls away with the content and each meal header carries its own subtotal (spec §6, designer's call: not pinned in 003a).
- **Midnight rollover (AC 8):** while viewing "Today", the header and data switch to the new date on the next refresh, with no animation and no message.
- **Long and Italian names:** "Passata di pomodoro", "Crème caramel", a 200-character name: 2 lines then ellipsis; the kcal column never shrinks below its content; emoji render as stored.
- **Entry from a food that is now hidden or changed (AC 33):** looks exactly like any other entry. No "no longer listed" marker in 003.
- **Dynamic Type 200%:** see D5.

### S2. Add food sheet, Search page: initial

`Sheet` (bottom sheet native, 480 dialog on web ≥ 768), title "ADD FOOD", Close. Layout:
1. **Date line** (only when the sheet date is not today, AC 11): `label`, muted, under the title: "FOR YESTERDAY" or "FOR MON 19 OCT". Fixed for the life of the sheet (AC 8).
2. **Meal `Choice`** (label "Meal", visually hidden label on one line): chips "Breakfast", "Lunch", "Dinner", "Snacks", selected one outlined. One row at default text size.
3. **`SearchField`** (TextField change, D7): placeholder "Search foods", leading nothing, trailing 44 pt "✕" "Clear search" when there is text; return key "Search"; max 100 characters; focused on open.
4. **Hint** (`small`, muted): "Type at least 2 letters, like banana or oats."
5. Results area (empty).
6. `notice` slot (Undo bar or error) and footer: empty until the first add.

States:
- **First-time (user has never used "+"):** under the hint, a second line: "Tap + to add a food at its usual serving, or tap the food to change the amount." It shows until the first successful quick add, then never again.
- **Returning:** the hint only. No recent foods (005).
- **1 character typed:** hint stays, no request.

### S3. Add food sheet, Search page: loading, results, end of list

- **Loading:** if the request takes over 200 ms, three `Skeleton` rows (name block + meta block + a 44 pt circle). Previous results are hidden while a new query is loading (AC 14). Accessible status "Searching" (polite, once per query).
- **Results:** up to 25 `FoodRow`s (new), hairline dividers. Each row, left to right:
  - Text column: name (`foodName`, 2 lines, ellipsis); meta (`small`, muted) "Brand · 1 medium (118 g) · 105 kcal" (brand omitted when none; "100 g · 89 kcal" when the food has no servings; imperial users see "1 medium (4.2 oz) · 105 kcal" and, for no-serving foods, "3.5 oz · 89 kcal", which is still the 100 g amount); tier `Tag` "VERIFIED" / "BRAND" / "COMMUNITY" on its own line below the meta (neutral Tag; colour badges and explainers are 009).
  - Right: the quick-add button, 44 × 44, radius 12, 1.5 pt `accentText` outline, "+" glyph in `accentText`. Label "Add {name}, 105 kilocalories". After a successful add it shows "✓" for 1.2 s (accessible state not changed; the announcement carries the news).
  - Tapping anywhere else on the row opens S5 (the detail). Row ≥ 64 pt.
- **25 results returned:** a muted line after the list: "Showing the top 25. Add a word to narrow it down."
- **Result for a food hidden while the list is open:** it can still be added or opened (values are on screen, spec §6). No marker.
- **Italian and long names:** as published, in the same list as English names; an alias match (003b) shows the real catalogue name only.
- **003b dependency:** 003b changes ordering only. Rows look the same; no "best match" label is added.

### S4. Add food sheet, Search page: no results, error, offline

- **No results:** `bodyRegular` "No match for “{query}”. Try fewer words or another spelling." (the query is shown as typed, clamped to 2 lines). Second line (`small`, muted), **until 003b and 011 ship**: "Most foods are listed by their English name for now." This is honest for Italian users searching "pane" before aliases exist, and is removed when 003b ships (D8). No "Create a food" (006).
- **Error:** `Notice` danger "Couldn't search right now. Check your connection and try again." with "Try again". Typed text kept, previous results hidden.
- **Offline (the OS reports no connection):** `Notice` danger "You're offline. Search needs a connection, so try again when you're back." with "Try again".
- **Typing during loading or error:** never blocked; a new query replaces the state.

### S5. Food detail and amount (pushed page inside the Add food sheet)

Sheet title becomes "LOG FOOD", with "‹ Back" (the Sheet `onBack` page pattern from 001 S7). Layout:
1. Name (`foodName` large, wraps fully, no clamp), brand (`body`, muted), tier `Tag`.
2. **Serving `Choice`** (label "Amount"): one chip per named serving "1 medium (118 g)", "1 cup, sliced (150 g)" … then "g"; imperial users see "1 medium (4.2 oz)" and both "oz" and "g". Chips wrap. Default: the first named serving, or "g" when there is none.
3. **Quantity `Stepper`** (decimal change, D7): step 0.5 for servings, 10 for g, 0.5 for oz; value starts at 1 (serving) or 100 (g) / 3.5 (oz); unit label "SERVINGS", "G" or "OZ". Accepts "1,5" and "1.5", two decimals. Selected on focus.
4. **Live result** (one accessible element): `numberInput` "105" + `label` "KCAL", then `MacroTrio` compact with one decimal "P 1.3 g · C 26.9 g · F 0.4 g".
5. **Meal `Choice`** (same chips as S2, starting from the sheet's meal; changing it here also changes the sheet's meal).
6. Label "MORE NUTRIENTS (THIS AMOUNT)", then four `BreakdownRow`s: "Fibre" 3.1 g, "Sugars" 14.4 g, "Saturated fat" 0.1 g, "Sodium" 1 mg. Unknown values show "–" with the sub-line "Not listed"; a real zero shows "0 g".
7. Carbs basis line (`small`, muted) when known: "Carbs include fibre" or "Carbs on this label don't include fibre".
8. Per-100 g line (`small`, muted): "Per 100 g: 89 kcal · P 1.1 g · C 22.8 g · F 0.3 g".
9. Estimates line (`small`, muted): "Values are estimates. Check the label if you want to be sure."
10. Footer: primary `Button` "LOG · 105 KCAL" (kcal live).

States:
- **Invalid amount (empty, 0, below 0.1 g, above 10,000 g, more than 2 decimals, text):** inline error under the Stepper "Enter an amount from 0.1 g to 10,000 g" (imperial "Enter an amount from 0.01 oz to 352.7 oz"), the result shows "–", the Log button is inactive with the hint "Enter an amount to log".
- **Logging:** Log shows the busy spinner ("Logging"), controls inactive, double tap ignored (AC 26). On success the page pops back to Search with the tally and Undo bar.
- **Write failed:** `Notice` danger in the sheet's notice slot (see copy 3-w1); the button label becomes "TRY AGAIN"; the amount stays.
- **Consent missing:** consent page pushed (S8).
- **Day full:** `Notice` info "This day is full. Remove an entry to add another."; Log inactive.
- **Food with no servings:** serving chips are just "g" (and "oz"); 100 g default.
- **Unit switch (serving → g/oz):** amount converted, not reset (D1 challenge 3).
- **Loading:** none; the detail uses the row data already loaded (no extra request).
- **Offline:** detail works (data is local); Log fails visibly.

### S6. Search page after adds (tally, Undo, error)

- **Footer appears after the first successful add:** one row, tally (`body`) "Added 2 items · 340 kcal" on the left and a secondary `Button` "Done" on the right (44 pt min). At large text they stack.
- **Undo bar (`UndoBar`, new) in the notice slot:** surface fill, `border` outline, text (`body`) "Added to Breakfast · 105 kcal" and a text button "Undo". 5 s (see D1 challenge 4). A new add replaces the bar (Undo then applies to the latest add; earlier ones are deleted from Today). Undo removes the entry, updates the tally ("Added 1 item · 235 kcal"; back to no footer at 0), and announces "Removed".
- **Quick-add failed:** the Undo bar is replaced by `Notice` danger 3-w1 with "Try again" (retries the same tapped food with the same client id); the row's "+" stays "+"; the tally is unchanged.
- **Closing with entries added:** no confirmation (nothing is unsaved). Today shows the updated day.

### S7. Edit entry sheet

`Sheet`, title "EDIT ENTRY", Close. Content is built from the snapshot only (AC 29). Layout as S5, with these differences:
- **Amount options come from the snapshot:** the logged serving "1 medium (118 g)" (if it was a serving), "g", and "oz" for imperial users. Other named servings of the food are not offered, because reading them would need the catalogue (AC 29, 30). See D8.
- The amount starts as logged ("1.5 × 1 medium", "150 g", "5 oz").
- Meal chips start at the entry's meal.
- Footer: primary "SAVE · 158 KCAL", inactive until something changed (hint "Change the amount or meal to save"), then a danger text `Button` "Delete entry".

States:
- **Unchanged / changed:** as above. Closing when changed: the existing discard confirm "Discard your changes?" / "Discard" / "Keep editing".
- **Saving:** busy, double tap ignored. Success: sheet closes, Today updates, polite announcement "Entry updated".
- **Delete:** sheet closes, the row is removed, Today shows the Undo bar "Removed." + "Undo".
- **Already removed elsewhere (AC 34):** `Notice` info "This entry was already removed." for 2 s with the sheet closing and the day refreshing; not an error colour.
- **Write failed:** Notice danger 3-w1, "TRY AGAIN", values kept.
- **Offline:** opens normally (snapshot); save fails visibly.
- **Unit change since logging:** an entry logged in grams shows "150 g" for a metric user and "5.3 oz" for imperial; one logged as "5 oz" reopens as "5 oz" (AC 19).

### S8. Consent needed (pushed page in the Add food or Edit sheet)

The 001 S1 consent content, unchanged, as a sheet page with Back (the 001 S10 pattern), subline variant C-c13 ("You turned off health-data consent…"). "I AGREE" records consent and saves the pending entry in the same step, then returns to Search (or closes Edit) with the normal success state. "NO THANKS" returns with `Notice` info "We need your consent to save your diary. Nothing was saved." and the amount kept.

### S9. Date picker

- **iOS and Android:** a small `Sheet` titled "PICK A DAY" with the platform inline calendar (min 2020-01-01, max tomorrow). Tapping a day navigates immediately and closes (1 tap). Android may use the system date dialog with its own OK instead (architect's choice; then it's 2 taps).
- **Web:** a native `input type="date"` with min/max, opened from the day-name button.
- "Today" and the ‹ › buttons remain the fast path; the picker is for jumps.

### S10. Today with Undo after a delete

The `UndoBar` floats above the pinned ADD FOOD button: "Removed." + "Undo", 5 s (same rules as S6). Undo puts the entry back in its place with the same values; announcement "Entry restored".

## D3. Interactions

**Gestures**
- Sheet: swipe down closes (blocked by the discard confirm only when an amount or edit is dirty). Android back and web Escape: on S5 go back to Search, on S2/S6 close the sheet, on S7 close (confirm when dirty).
- Entry row (native): swipe left reveals "Delete" (danger fill, `onAccent`-style dark text in dark theme, white in light); a full swipe deletes. The same action is in the screen-reader actions menu and in the edit sheet, so swipe is never the only way.
- No pull-to-refresh in 003a (the day refreshes on focus and on foreground); add only if QA finds stale days.
- No long-press actions in 003a.

**Haptics** (existing `haptics` wrapper; no-op on web)
- Entry saved (quick add or Log): `light`. Not `success`: a full day is 6+ adds and the success pattern would feel like a celebration of eating.
- Edit saved: `light`. Delete: `light`. Undo: none.
- Meal chip, serving chip, Stepper: `selection` (existing).
- Errors: none (001 rule).

**Animation** (motion tokens; with Reduce Motion, instant or ≤ 100 ms fade)
- New entry row on Today: fades in over `motion.base` so the user sees where it went. No count-up on totals.
- Undo bar: slides up 8 pt and fades in over `motion.fast`.
- Quick-add "+" → "✓": cross-fade over `motion.fast`.
- Lane bar segments fill over `motion.base` when totals change.
- Skeleton: static `trackEmpty` blocks, no shimmer (shimmer adds motion with no information).

**Keyboard**
- Search: autofocus on open, return key "Search" (submits immediately, skipping the debounce); after an add the query is selected; "Clear search" empties and keeps focus.
- Quantity: decimal pad, accepts "," or "."; iOS accessory bar with "Done"; Android IME "done". The footer Log button rides above the keyboard.
- Web: Tab order follows D5; in results, Up/Down arrows move between rows (roving focus), Enter on a row opens the detail, Tab moves to its "+", Enter/Space on "+" adds; Escape as above.

**Undoable**
- Each add (quick or from detail): Undo bar, then delete from Today any time.
- Delete: Undo bar for 5 s (screen-reader rule in D1). After that, re-add.
- Edit: no undo; edit again. Values and history are never changed by the catalogue (AC 33).
- Date navigation and meal choice: freely reversible.

## D4. Copy (verbatim)

Rules applied: numbers before words; descriptive, never evaluative; no banned words (spec §7); food names as published. Placeholders in {braces}; numbers use en-US thousands separators; kcal are whole numbers. Caps strings are rendered caps by their type variant; the stored string is as written below, and screen readers get the sentence-case form.

| ID | Where | String |
|---|---|---|
| 3-t1 | S1 eyebrow | "{EEE d MMM}" / with year "{EEE d MMM yyyy}" / Today with name "Hi {name} · {EEE d MMM}" |
| 3-t2 | S1 day name | "Today" / "Yesterday" / "Tomorrow" / "{EEE d MMM}" |
| 3-t3 | S1 nav (a11y) | "Previous day" / "Next day" / "Choose a day, {spoken date}" / "Today" (button) |
| 3-t4 | S1 limits (a11y hint) | "Tomorrow is the latest day you can log." / "1 Jan 2020 is the earliest day you can log." |
| 3-t5 | S1 card | "CALORIES" · "KCAL LEFT" · "KCAL LOGGED" · "{logged} of {target} kcal logged" |
| 3-t6 | S1 over target | "{n} kcal above your target" · macro "{n} g above" |
| 3-t7 | S1 no target | "No target was set for this day" |
| 3-t8 | S1 macros | "{logged} / {target} g" · "PROTEIN" · "CARBS" · "FAT" |
| 3-t9 | S1 meals | "Breakfast" · "Lunch" · "Dinner" · "Snacks" · subtotal "{n} kcal" · "+" a11y "Add to {meal lower}" |
| 3-t10 | S1 empty meal | "Add breakfast" / "Add lunch" / "Add dinner" / "Add snacks" |
| 3-t11 | S1 empty past day | "Nothing logged for this day" |
| 3-t12 | S1 first-time hint | "Tap + on a meal to log your first food." |
| 3-t13 | S1 first landing (001 C-t1) | "Plan saved. Let's get going." |
| 3-t14 | S1 pinned | "ADD FOOD" |
| 3-t15 | S1 loading (a11y) | "Loading your day" |
| 3-t16 | S1 error | "Couldn't load this day. Check your connection and try again." / "Try again" |
| 3-t17 | S1 partial | "Couldn't load your target for this day." / "Try again" |
| 3-t18 | S1 offline | "Offline. You're seeing what was already loaded." |
| 3-t19 | Day full | "This day is full. Remove an entry to add another." |
| 3-t20 | S1 entry detail line | "{qty} × {serving label}" when qty ≠ 1, "{serving label}" when 1, "{n} g", "{n} oz" |
| 3-t21 | Settings button (as shipped) | "Profile & settings" |
| 3-s1 | S2 title | "ADD FOOD" |
| 3-s2 | S2 date line | "For yesterday" / "For tomorrow" / "For {EEE d MMM}" |
| 3-s3 | S2 meal label (a11y) | "Meal" |
| 3-s4 | S2 field | placeholder "Search foods" · a11y "Search foods" · clear "Clear search" |
| 3-s5 | S2 hint | "Type at least 2 letters, like banana or oats." |
| 3-s6 | S2 first-time | "Tap + to add a food at its usual serving, or tap the food to change the amount." |
| 3-s7 | S3 loading (a11y) | "Searching" |
| 3-s8 | S3 row meta | "{brand} · {serving label} ({n} g) · {kcal} kcal" / no serving "100 g · {kcal} kcal" (imperial "3.5 oz · {kcal} kcal") |
| 3-s9 | S3 tier | "Verified" / "Brand" / "Community" |
| 3-s10 | S3 quick add (a11y) | "Add {name}, {kcal} kilocalories" |
| 3-s11 | S3 end of list | "Showing the top 25. Add a word to narrow it down." |
| 3-s12 | S4 no results | "No match for “{query}”. Try fewer words or another spelling." |
| 3-s13 | S4 no results, until 003b | "Most foods are listed by their English name for now." |
| 3-s14 | S4 error | "Couldn't search right now. Check your connection and try again." / "Try again" |
| 3-s15 | S4 offline | "You're offline. Search needs a connection, so try again when you're back." / "Try again" |
| 3-d1 | S5 title | "LOG FOOD" · "Back" |
| 3-d2 | S5 amount | "Amount" · "{label} ({n} g)" / "({n} oz)" · "g" · "oz" · stepper units "SERVINGS" / "G" / "OZ" · a11y "Amount, {value} {unit}. Adjustable." · "Increase by {step}" / "Decrease by {step}" |
| 3-d3 | S5 amount error | "Enter an amount from 0.1 g to 10,000 g" / imperial "Enter an amount from 0.01 oz to 352.7 oz" · button hint "Enter an amount to log" |
| 3-d4 | S5 result | "KCAL" · "P {p} g · C {c} g · F {f} g" (a11y "Protein {p} grams, carbs {c} grams, fat {f} grams") |
| 3-d5 | S5 nutrients | "More nutrients (this amount)" · "Fibre" · "Sugars" · "Saturated fat" · "Sodium" · unknown "–" + "Not listed" (a11y "{nutrient}, not listed") |
| 3-d6 | S5 carbs basis | "Carbs include fibre" / "Carbs on this label don't include fibre" |
| 3-d7 | S5 per 100 g | "Per 100 g: {kcal} kcal · P {p} g · C {c} g · F {f} g" |
| 3-d8 | S5, S7 estimates | "Values are estimates. Check the label if you want to be sure." |
| 3-d9 | S5 footer | "LOG · {kcal} KCAL" (a11y "Log, {kcal} kilocalories") · busy "Logging" |
| 3-a1 | S6 tally | "Added 1 item · {kcal} kcal" / "Added {n} items · {kcal} kcal" · "Done" |
| 3-a2 | S6 Undo bar | "Added to {Meal} · {kcal} kcal" / "Undo" · announcement "{name} added to {meal lower}, {kcal} kilocalories" · after Undo "Removed" |
| 3-e1 | S7 title | "EDIT ENTRY" |
| 3-e2 | S7 footer | "SAVE · {kcal} KCAL" · hint "Change the amount or meal to save" · "Delete entry" · busy "Saving" |
| 3-e3 | S7 saved (announcement) | "Entry updated" |
| 3-e4 | S7 gone | "This entry was already removed." |
| 3-e5 | Discard (existing Sheet copy) | "Discard your changes?" / "Discard" / "Keep editing" |
| 3-r1 | S10 / S1 Undo bar | "Removed." / "Undo" · after Undo "Entry restored" |
| 3-r2 | Swipe action / a11y action | "Delete" |
| 3-w1 | Any write failed | "Couldn't save that yet. Check your connection and try again." / "Try again" / button "TRY AGAIN" |
| 3-w2 | Consent declined | "We need your consent to save your diary. Nothing was saved." |
| 3-w3 | Server rejected a value (validation, not day full) | "That didn't save. Check the amount and try again." |
| 3-p1 | S9 | "PICK A DAY" |
| 3-x1 | Entry row (a11y) | "{name}, {amount}, {kcal} kilocalories, {tier}. Double tap to edit." |
| 3-x2 | Result row (a11y) | "{name}, {brand}, {serving}, {kcal} kilocalories, {tier}. Double tap for amount." |
| 3-x3 | Summary (a11y, AC 49) | "{logged} of {target} kilocalories logged, {left} left" / over "{logged} of {target} kilocalories logged, {n} above your target" / no target "{logged} kilocalories logged. No target was set for this day." |
| 3-x4 | Meal heading (a11y) | "Breakfast, {n} kilocalories, {count} items" / empty "Breakfast, nothing logged" |

Sensitivity review first: 3-t6, 3-t5 hero switch, 3-t11, 3-s13, 3-a1.

## D5. Accessibility (WCAG 2.2 AA)

**Labels and roles**
- Summary card: one element with label 3-x3 (AC 49); the LaneBar inside is hidden from the reader to avoid saying it twice. Macro columns are separate elements: "Protein, 62 of 104 grams" / over "Protein, 116 of 104 grams, 12 above target".
- Meal titles are headings (3-x4). "+" buttons are named "Add to breakfast".
- Entry rows: one element (3-x3/x1) with role button and a custom action "Delete" (VoiceOver actions rotor, TalkBack actions menu).
- Result rows: the row (3-x2) and the "+" (3-s10) are two separate elements so each has one action.
- Food names with `name_lang = it`: `accessibilityLanguage="it-IT"` (iOS) and `lang="it"` (web) on the name text, so VoiceOver reads "Passata di pomodoro" in Italian. Android TalkBack ignores it, acceptable.
- Status changes announced politely: "Searching", result count once ("12 results"), "No match", search error, each add (3-a2), "Removed", "Entry restored", "Entry updated", write failures. Over target is **not** announced as an alert (AC 3): it's in the summary label only.
- Unknown nutrients read "Sodium, not listed", never "dash".
- Date header: "Previous day", "Next day" buttons; the day name is a button "Choose a day, Monday 19 October"; disabled limits use 3-t4 as hint.

**Focus order**
- Today: eyebrow → day name → previous → next → Today button (if shown) → status line → summary → macro columns → meals in order (heading, "+", entries or dashed button) → Profile & settings → ADD FOOD.
- Add food sheet: title → date line → meal chips → search field → hint → results (row, "+", row, "+" …) → end-of-list line → notice (Undo or error) → tally → Done. On open, reader focus goes to the title (existing Sheet behaviour) while the keyboard focus is in the field.
- Detail: Back → title → name → brand → tier → amount chips → stepper → result → meal chips → nutrients → notes → LOG.
- After Undo or a failed write, focus does not move (the message is announced). After a delete from the edit sheet, focus goes to the meal heading of the removed entry. On sheet close, focus returns to the control that opened it.

**Contrast**
- All text uses `text` / `textMuted` (≥ 4.5:1). Hero number in `accentText`. Quick-add and "+" outlines use `accentText` (≥ 3:1 in both themes). Dashed empty buttons use `border` plus `text`, and their text carries the meaning. Swipe Delete: dark text on `danger` (dark theme, about 6:1), white on light-theme `danger` (about 5.6:1). Macro progress bars use the data colours on `trackEmpty` (≥ 3:1) and always come with numbers.

**Colour is never the only signal**
- Over target is words ("240 kcal above your target") and the hero label change, not colour. Selected meal chip has outline weight plus `checked` state. Tier is a word. Errors carry text. The "✓" after quick add is backed by the announcement and the tally.

**Dynamic Type at 200%** (layouts switch at `largeTextScale` 1.5)
- Today header: the day name wraps; ‹ › move to their own row under it, still 44 pt.
- Summary: `numberXL` capped at 1.4× (existing); MacroTrio stacks (existing behaviour, `progress` variant included).
- Meal header: title and subtotal on line 1, "+" right-aligned and top-aligned; subtotal wraps under the title if needed.
- Entry row: kcal moves under the detail line ("105 kcal" inline), so the name keeps the full width; name clamp becomes 3 lines.
- Result row: name clamp 3 lines at large text (AC 13 says 2: see D8, a 2-line clamp at 200% hides most of a USDA name), meta and tier wrap, "+" stays top-right.
- Sheet: meal chips wrap to 2 × 2; the footer tally and Done stack; on S5 the LOG button stays pinned while the keyboard is open, other content scrolls.
- Test at iPhone SE (320 pt) AX5 and Android 200%, with the 200-character name, "Crème caramel", "Passata di pomodoro", and a no-serving food (AC 13).

**Touch targets**
- Every control ≥ 44 pt: ‹ ›, "+", quick add (44 × 44), chips, Clear search, Undo, Try again, Stepper (existing 52). Rows ≥ 56 (entries) and ≥ 64 (results). Primary buttons 56. Quick add is separated from the row's tap area by 8 pt so it can't be hit by mistake (WCAG 2.5.8 spacing).

**Other**
- Undo timing: D1 challenge 4. Nothing else times out.
- Web: Escape closes or goes back; focus is trapped in the dialog; visible focus ring (2 pt `accentText`) on rows and buttons; the pinned ADD FOOD never covers the focused element (scroll padding, 2.4.11).

## D6. Platform notes

**iOS**
- Add food and Edit use the native page sheet (existing Sheet); swipe-down dismiss blocked only when dirty.
- Autofocus of the search field happens after the sheet's present animation (otherwise the keyboard fights the sheet); about 300 ms.
- Swipe-to-delete via the gesture library the architect picks (react-native-gesture-handler's swipeable is the usual one; native-only).
- Date picker: inline calendar in a small sheet.
- Haptics: light impact per add.
- Decimal pad shows the locale separator; both "," and "." are parsed.

**Android**
- Bottom sheet at 90% height (existing). Hardware back: detail → search → close.
- IME action "search" on the field, "done" on the quantity.
- With the keyboard open, the sheet footer (tally/Done, or LOG) sits above it (edge-to-edge insets).
- Date: system date dialog or the inline calendar sheet (architect's choice).
- Haptics may be absent on some devices; nothing depends on them.
- Font scale to 200% (non-linear on Android 14+).

**Web**
- Sheet is a centred 480 dialog at ≥ 768 px wide; a full-height bottom sheet on narrow web (the 390 × 844 and 375 × 667 QA sizes).
- No swipe: delete is in the edit sheet; entry rows show no hover-only controls.
- Keyboard: arrows/Enter/Tab in results (D3), Escape. The search field is `type="search"` with `enterkeyhint="search"`; the quantity is `type="text" inputmode="decimal"` (no scroll-wheel changes).
- Date picker: `input type="date"` with min/max.
- No haptics. Today's pinned ADD FOOD sits inside the 480 column.
- Barcode typing in search is 004's (manual barcode entry); no camera anywhere in 003.

## D7. Design-system changes (proposed; apply to DESIGN_SYSTEM.md and packages/ui only after Gate 2)

| Change | Type | Justification |
|---|---|---|
| **FoodRow** | new component | Search result: name (clamped), meta line, tier Tag, separate 44 pt quick-add button. Reused by recents/favourites (005), scan results (004) and custom foods (006). |
| **EntryRow** | new component (the planned "meal row") | Diary entry: name, amount line, kcal column, whole-row tap, native swipe Delete, accessibility action Delete, large-text reflow. |
| **MealSection** | new component | Heading + subtotal + "+" + entries or dashed empty button. The dashed empty button replaces the canvas "Fix my day" (N4 out of scope). |
| **DateNav** | new component | Eyebrow date, day-name button (opens picker), ‹ ›, "Today"; limits with hints. Reused by weight (007) and reports. |
| **UndoBar** | new component | Transient confirmation with one action; 5 s, pauses on focus/hover, persistent with a screen reader; polite live region. `Notice` is for persistent messages and has no timer, so it isn't stretched to fit. |
| **Skeleton** | new component | Static `trackEmpty` blocks for loading states so loading never looks like zero (AC 6). No shimmer. |
| **DatePicker** | new wrapper | Platform picker with min/max (iOS inline in a Sheet, Android dialog, web `input type=date`). Likely a new Expo-compatible dependency: architect to choose. |
| **MacroTrio `progress` variant** | change | "62 / 104 g" with a proportional data-colour bar and an "{n} g above" line; the spoken form "62 of 104 grams". The existing variants stay. |
| **Stepper decimals** | change | Accept "," and "." with up to 2 decimals, non-integer steps (0.5), and a unit label per mode. Today it strips non-digits. |
| **TextField `search` mode** | change | Clear button (44 pt), return key "Search", no visible label (accessibility label kept), max length. |
| **Sheet `subtitle`** | change | The date line under the title (AC 11). Plus Escape handling on web if not already wired (AC 49). |
| **`foodName` type token** | new token | Barlow 600, 18 / 24 in rows and 22 / 28 on detail, **no uppercase transform**. Food names must appear as published (spec §6, AC 13): `title`/`headline` are caps and condensed, which alters names and hurts legibility of 200-character names. |
| **Tag as tier label** | reuse, no change | Neutral Tag with the tier word until 009 brings the `sourceBadge` colours and explainers. |
| **Today pattern (doc)** | doc change | Remove the streak badge and "Fix my day" from the Today pattern; add the pinned ADD FOOD and the over-target rule (hero becomes "KCAL LOGGED", words not colour). |
| **Add food pattern (doc)** | doc change | Search only until other modes ship (no disabled tabs); immediate write with tally and Undo; the staged "Log N items" CTA stays reserved for Describe (008). |
| **Haptics guidance (doc)** | doc change | Repeated adds use `light`, not `success`. |

No new colours.

## D8. Decisions needed and suggested spec changes (for Gate 2)

1. **AC 48 rewording** (D1 challenge 1): count meal change (1) and Done (1) separately; golden day ≤ 18 interactions, < 60 s.
2. **AC 18 unit switch:** convert the current amount instead of resetting to 100 g. Recommended.
3. **Over-target hero:** switch the hero to "2,040 KCAL LOGGED" with "240 kcal above your target" (recommended), or keep the hero slot as "240 KCAL ABOVE YOUR TARGET".
4. **Undo timing for assistive tech** (D1 challenge 4): pause on focus/hover, persistent with a screen reader. Recommended; changes AC 24/32 wording slightly.
5. **Edit offers only the logged serving + g (+ oz)** (S7), because other servings would need the catalogue. Alternative for the architect: snapshot the food's servings list (up to 10 × label+grams) on the entry so edit can offer all of them.
6. **AC 13 clamp at large text:** 3 lines at font scale ≥ 1.5, 2 otherwise.
7. **"Most foods are listed by their English name for now."** on no results until 003b ships. Recommended; remove in 003b.
8. **Date picker dependency** (S9): approve a platform date picker package (architect picks).
9. **Quick-add button style:** volt outline (recommended, avoids a column of volt fills) vs volt fill.
10. **Later, not 003:** a quantity choice on long-press of "+" (for "2 eggs" as one entry), and a pinned compact summary for very long days.

## D9. Mockups for the design canvas (section "Feature 003 — Food search & diary")

All boards 390 × 844, dark theme, Track Day v1 tokens, iPhone status bar and home indicator, sample user "Sam", target 1,800 / 104 / 200 / 60. Use the existing components from the "Track Day — design system v1" board. Add the section to MOCKUPS.md as "Awaiting Gate 2" once drawn.

1. **003 · 01 Today, first day (empty).** Eyebrow "HI SAM · WED 21 OCT", display "TODAY" with ‹ › on the right (› enabled). Accent line "Plan saved. Let's get going." Card: label "CALORIES", volt "1,800" + "KCAL LEFT", "0 of 1,800 kcal logged", empty 10-segment lane, MacroTrio progress "0 / 104 g PROTEIN", "0 / 200 g CARBS", "0 / 60 g FAT" with empty bars. Muted "Tap + on a meal to log your first food." Four sections, each title + "+" and a dashed 56 pt "Add breakfast" etc. "Profile & settings". Pinned volt "ADD FOOD".
2. **003 · 02 Today, mid-day (returning).** Breakfast "331 kcal": "Egg, whole, cooked, hard-boiled" 1 large (50 g) 78; "Bread, white, toasted" 2 × 1 slice (25 g) 146; "Coffee, brewed" 1 cup (237 g) 2; "Bananas, raw" 1 medium (118 g) 105. Lunch "38 kcal": "Passata di pomodoro" 150 g 38 (Italian name as published). Dinner and Snacks dashed. Card "1,431" KCAL LEFT, "369 of 1,800 kcal logged", 2 segments filled, macros "19 / 104 g", "58 / 200 g", "9 / 60 g".
3. **003 · 03 Today, over target.** Hero "2,040" + "KCAL LOGGED", line "240 kcal above your target", lane fully volt, protein "116 / 104 g" with muted "12 g above". No red anywhere. Annotate: "no alert, no colour change".
4. **003 · 04 Today, past day empty.** Eyebrow "MON 19 OCT", display "MON 19 OCT", text button "Today" on the eyebrow row, card with "1,800 KCAL LEFT", muted "Nothing logged for this day", dashed meal buttons.
5. **003 · 05 Today, no target for this day.** "THU 15 JAN 2026" (before first target): hero "620" + "KCAL LOGGED", "No target was set for this day", no lane bar, macros "31 g", "70 g", "22 g".
6. **003 · 06 Today, loading and error (two frames side by side).** Left: header live, skeleton blocks in the card, four meal titles only, no ADD FOOD. Right: danger Notice "Couldn't load this day. Check your connection and try again." with "Try again", no meals.
7. **003 · 07 Today, offline and Undo.** Notice "Offline. You're seeing what was already loaded." under the header; an UndoBar above ADD FOOD "Removed." + "Undo".
8. **003 · 08 Add food, initial (first-time).** Sheet "ADD FOOD", meal chips with Breakfast selected, focused search field "Search foods" with keyboard up, hint and first-time line.
9. **003 · 09 Add food, results.** Query "banana" (Clear ✕ visible). Rows: "Bananas, raw" · "1 medium (118 g) · 105 kcal" · VERIFIED; "Bananas, dehydrated, or banana powder" · "1 cup (100 g) · 346 kcal" · VERIFIED; "Banana chips" · "Brand Co · 1 oz (28 g) · 147 kcal" · BRAND; one COMMUNITY row. Volt-outline "+" on each. Keyboard up.
10. **003 · 10 Add food, after two adds.** Same list, first row "+" shown as "✓", query text selected, UndoBar "Added to Breakfast · 105 kcal" + "Undo", footer "Added 2 items · 183 kcal" + "Done".
11. **003 · 11 Add food, yesterday + no results.** Date line "FOR YESTERDAY", query "pane integrale", "No match for “pane integrale”. Try fewer words or another spelling." and muted "Most foods are listed by their English name for now."
12. **003 · 12 Add food, search error and write error (two frames).** Left: danger Notice "Couldn't search right now…" + "Try again", query kept. Right: results with danger Notice in the footer area "Couldn't save that yet. Check your connection and try again." + "Try again".
13. **003 · 13 Food detail.** "LOG FOOD" with Back; "Bananas, raw", VERIFIED tag; chips "1 medium (118 g)" (selected), "1 large (136 g)", "1 cup, sliced (150 g)", "g"; Stepper "1.5" SERVINGS; result "158" KCAL, "P 2.0 g · C 40.4 g · F 0.5 g"; meal chips; nutrients Fibre 4.6 g, Sugars 21.6 g, Saturated fat 0.2 g, Sodium "–" "Not listed"; "Carbs include fibre"; per 100 g line; estimates line; pinned "LOG · 158 KCAL".
14. **003 · 14 Detail, invalid amount + long name.** A 200-character name wrapping fully, chip "g" selected, field "12000", inline error "Enter an amount from 0.1 g to 10,000 g", result "–", LOG inactive.
15. **003 · 15 Edit entry.** "EDIT ENTRY", "Passata di pomodoro", chips "g" (selected), stepper "150" G, result, meal chips Lunch selected, "SAVE · 38 KCAL" inactive, danger text "Delete entry".
16. **003 · 16 Today, swipe delete.** An entry row swiped left showing the danger "Delete" action.
17. **003 · 17 Dynamic Type 200% (two frames).** Left: Today at AX5 on 320 pt width (‹ › on their own row, MacroTrio stacked, entry kcal under the name). Right: results at AX5 (3-line names, tier below meta, "+" top-right, chips 2 × 2).
18. **003 · 18 Wide web dialog.** 1280 × 800: Today in the 480 column, Add food as a centred 480 dialog with results, focus ring on the second row.
19. **003 · 19 Light theme check.** Board 02 and 09 in light theme (accentText #3F5A00 for hero and "+" outlines).
