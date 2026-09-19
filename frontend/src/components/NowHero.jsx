import { useEffect, useState } from "react";
import { ApiError, getAudio } from "../api";
import { goldenHourLine } from "../format";
import { goldenHourAt, goldenHourEnd, minutesLeftAt, splitPlaceholders } from "../planview";
import Icon from "./Icon";
import { Notice } from "./Notice";

const LANGUAGES = [
  { code: "en", label: "English", name: "EN" },
  { code: "hi", label: "हिन्दी", name: "हिन्दी" },
];

const AUDIO_FALLBACK =
  "Audio is unavailable right now. Please read the script on screen.";

/** The first-hour line, counting down on its own.
 *
 * The plan says how many minutes were left when it was built. The end of the
 * hour is worked out once, on first render, and after that the phone's clock
 * does the counting - every 30 seconds, and not at all once it has run out.
 * At zero the line becomes the message for an hour that has gone, which is
 * still worth acting on. */
function useGoldenHour(goldenHour) {
  const [anchor] = useState(() => {
    const start = Date.now();
    return { start, end: goldenHourEnd(goldenHour, start) };
  });
  const [now, setNow] = useState(anchor.start);
  const running = Boolean(goldenHour) && !goldenHour.expired && minutesLeftAt(anchor.end, now) > 0;

  useEffect(() => {
    if (!running) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, [running]);

  return goldenHourLine(goldenHourAt(goldenHour, anchor.end, now));
}

/** Anything in [square brackets] is something the caller has to fill in or
 * say aloud, so it is marked. The brackets stay: they are part of the text. */
function ScriptText({ text, lang }) {
  return (
    <p className="script" lang={lang}>
      {splitPlaceholders(text).map((part, i) =>
        part.placeholder ? <mark key={i} className="ph">{part.text}</mark> : part.text)}
    </p>
  );
}

function Script({ caseId, script }) {
  const [lang, setLang] = useState("en");
  // Audio is view state, not flow state: the URL expires in minutes, so it is
  // fetched on the press and never carried around in the reducer.
  const [audio, setAudio] = useState({});
  const current = audio[lang] ?? {};

  async function listen() {
    setAudio((prev) => ({ ...prev, [lang]: { busy: true } }));
    try {
      const { url } = await getAudio(caseId, lang);
      setAudio((prev) => ({ ...prev, [lang]: { url } }));
    } catch (err) {
      const message = err instanceof ApiError && err.code === "audio_unavailable"
        ? err.message
        : AUDIO_FALLBACK;
      setAudio((prev) => ({ ...prev, [lang]: { error: message } }));
    }
  }

  return (
    <div className="script-block">
      <h2>Your call script</h2>
      <p className="hint">
        1930 is the national cyber crime helpline. Read the script below to them.
      </p>

      <div className="tabs" role="tablist" aria-label="Script language">
        {LANGUAGES.map((option) => (
          <button
            key={option.code}
            type="button"
            role="tab"
            id={`tab-${option.code}`}
            aria-selected={lang === option.code}
            aria-controls={`panel-${option.code}`}
            className={`tab${lang === option.code ? " tab-on" : ""}`}
            onClick={() => setLang(option.code)}
          >
            {option.name}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`panel-${lang}`}
        aria-labelledby={`tab-${lang}`}
        tabIndex={0}
      >
        <ScriptText text={script?.[lang]} lang={lang} />

        <button
          type="button"
          className="button button-quiet"
          onClick={listen}
          disabled={current.busy}
          aria-busy={current.busy}
        >
          {current.busy ? "Preparing audio…" : `Listen (${LANGUAGES.find((l) => l.code === lang).label})`}
        </button>

        {current.url && (
          // eslint-disable-next-line jsx-a11y/media-has-caption -- the caption is
          // the script printed above this player, in the same language.
          <audio className="player" controls autoPlay src={current.url}>
            Your browser cannot play audio. Please read the script above.
          </audio>
        )}
        {current.error && <Notice kind="warn">{current.error}</Notice>}
      </div>
    </div>
  );
}

/** The one thing to do first, and what to say when doing it. The only filled
 * button on the page is inside it. */
export default function NowHero({ caseId, clocks, script }) {
  const line = useGoldenHour(clocks?.goldenHour);
  return (
    <section id="now" className="card call-now" tabIndex={-1}>
      <p className="eyebrow">Now</p>
      <a className="button button-call" href="tel:1930">
        <Icon name="phone" size={22} />
        Call 1930 now
      </a>
      {line && <p className="golden">{line}</p>}
      <Script caseId={caseId} script={script} />
    </section>
  );
}
