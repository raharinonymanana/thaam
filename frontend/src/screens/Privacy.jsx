import Screen from "../components/Screen";

/** "How Thaam handles your data".
 *
 * Every sentence here is a fact about the system as built - the 7 and 90 day
 * lifecycle rules, the region, the masking, what the two kinds of email carry.
 * Nothing on this page is an intention or a promise about a future version: a
 * privacy page that overstates is worse than none, because it is the page
 * someone decides to trust us on.
 */
export default function Privacy({ onBack }) {
  return (
    <Screen title="How Thaam handles your data">
      <button type="button" className="button button-quiet back" onClick={onBack}>
        ← Back
      </button>

      <h2>What we keep</h2>
      <ul className="plain">
        <li>Your screenshot. It is deleted automatically after 7 days.</li>
        <li>
          The 8 payment details you confirmed, and the plan built from them.
          They are deleted automatically after 90 days.
        </li>
        <li>
          We do not keep the full text read from your screenshot — only those
          details.
        </li>
      </ul>

      <h2>Where it is kept</h2>
      <ul className="plain">
        <li>Amazon Web Services, United States (us-east-1).</li>
        <li>Stored encrypted, and sent only over HTTPS.</li>
        <li>
          Your screenshot is resized on your phone and its location data
          removed before it is uploaded.
        </li>
      </ul>

      <h2>Your link is your key</h2>
      <ul className="plain">
        <li>There is no account and no password.</li>
        <li>The part of the link after # never reaches our servers or their logs.</li>
        <li>Anyone with the link can open your case — don&apos;t share it.</li>
      </ul>

      <h2>What we never store or send</h2>
      <ul className="plain">
        <li>Your full account number. We keep only the last 4 digits.</li>
        <li>
          Reminder emails never contain your amount, your account, your UPI ID
          or your bank name.
        </li>
        <li>The email you send to family contains no link to your case.</li>
      </ul>

      <h2>Our logs</h2>
      <ul className="plain">
        <li>They record a scrambled fingerprint of your case, never the case link itself.</li>
        <li>Each part of Thaam can only touch what it needs.</li>
      </ul>

      <h2>You are in control</h2>
      <ul className="plain">
        <li>
          &ldquo;Delete my case now&rdquo; on your plan removes everything
          immediately.
        </li>
        <li>
          One honest exception: an older voice file from a previous version of
          your plan is removed automatically within 90 days.
        </li>
        <li>
          Ticks on your checklist are saved only on this phone. Delete my case
          now clears them.
        </li>
      </ul>

      <button type="button" className="button" onClick={onBack}>
        Back
      </button>
    </Screen>
  );
}
