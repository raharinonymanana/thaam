import { useEffect, useRef, useState } from "react";
import ActionBar from "../components/ActionBar";
import Icon from "../components/Icon";
import Screen from "../components/Screen";
import { ErrorNotice } from "../components/Notice";
import { ACCEPTED_TYPES, isAcceptedType, REJECT_MESSAGE } from "../image";

export default function Upload({ file, busy, error, onChoose, onSubmit }) {
  const [preview, setPreview] = useState(null);
  const [rejected, setRejected] = useState(null);
  const previewUrl = useRef(null);
  const picker = useRef(null);

  // An object URL pins the whole decoded image in memory until it is revoked,
  // so the previous one goes as soon as another file is chosen...
  function showPreview(chosen) {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = chosen ? URL.createObjectURL(chosen) : null;
    setPreview(previewUrl.current);
  }

  // ...and the last one goes when this screen does.
  useEffect(() => () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
  }, []);

  function choose(event) {
    const chosen = event.target.files?.[0] ?? null;
    if (chosen && !isAcceptedType(chosen.type)) {
      // A HEIC from an iPhone or a PDF lands here. Say so before the upload,
      // not after a rejected request.
      setRejected({ message: REJECT_MESSAGE });
      showPreview(null);
      onChoose(null);
      return;
    }
    setRejected(null);
    showPreview(chosen);
    onChoose(chosen);
  }

  return (
    <Screen title="Add your screenshot">
      <p className="lead">
        The SMS or UPI app screen that shows the money leaving your account.
      </p>

      {/* The real file input stays in the DOM - visually hidden, not
          display:none - so a keyboard and a screen reader still reach it. The
          zone around it is the thing people see and tap. accept= makes a phone
          offer the gallery and the camera rather than its whole file system. */}
      <div className="zone">
        <label className="sr-only" htmlFor="screenshot">Screenshot</label>
        <input
          id="screenshot"
          ref={picker}
          className="sr-only"
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          onChange={choose}
          disabled={busy}
        />

        {preview ? (
          <div className="zone-preview">
            <img className="preview" src={preview} alt="The screenshot you chose" />
            <button
              type="button"
              className="button button-quiet button-small"
              onClick={() => picker.current?.click()}
              disabled={busy}
            >
              Change
            </button>
          </div>
        ) : (
          <label className={`dropzone${busy ? " dropzone-off" : ""}`} htmlFor="screenshot">
            <span className="dropzone-icon"><Icon name="image-plus" size={26} /></span>
            <span className="dropzone-title">Tap to add screenshot</span>
            <span className="dropzone-sub">Take a photo or choose from gallery</span>
          </label>
        )}
      </div>

      <ErrorNotice error={rejected} />
      <ErrorNotice error={error} onRetry={() => onSubmit(file)} busy={busy} />

      <ActionBar>
        <button
          type="button"
          className="button"
          onClick={() => onSubmit(file)}
          disabled={busy || !file}
          aria-busy={busy}
        >
          {busy ? "Uploading…" : "Upload and continue"}
        </button>
      </ActionBar>
    </Screen>
  );
}
