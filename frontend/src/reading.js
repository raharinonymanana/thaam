// What the "Reading your screenshot" screen says, and when. Kept apart from the
// component so the wording and the timing can be checked without a browser.
//
// There is deliberately no percentage: the wait is one Textract call whose
// length nobody knows, and a bar that creeps to 90% and stalls is a promise the
// app cannot keep. Each message is true whenever it appears.
export const READING_STAGES = [
  { after: 0, text: "This takes a few seconds. Please keep this page open." },
  { after: 4000, text: "Finding the amount, date and UTR…" },
  { after: 9000, text: "Almost there — keep this page open." },
];
