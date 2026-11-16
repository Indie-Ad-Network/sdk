"""Bake a playable's voice lines with Chatterbox (run locally), cloned from a consented voice sample.

Run from the ad's folder (or pass --ad). Reads every line from src/lines.mjs (`say` if a line has one, else
`text`; a line may also be a plain string), renders it in the voice of the reference clip and writes
vo/recorded/<key>.wav, which the ad's build then uses (tools/build.mjs: voice()).

Each take is heard back by Whisper and must say the line's words; it must also be no longer than BASE seconds
plus PER_WORD a word (a slow line holds up the narrator, and Chatterbox now and then drawls one out). A take
that fails is rendered again with the next seed, up to TRIES times, and the best is kept. Whisper only checks
the words: delivery needs an ear. For a flat line, audition seeds (--audition) and pin the one chosen.
vo/direction.json directs a line by key: "say", "exaggeration", "cfg_weight", "seed" (a take picked at an
audition), and "heard": other ways Whisper may write a line that isn't words ("Mm-hm."), any of which passes.
vo/recorded/manifest.json records what each take was made from (and its seed), so only new or changed lines
are rendered again.

The voice: the reference clip matters most (an energetic sample of the speaker, not a flat reading), then
exaggeration 0.9 and cfg_weight 0.3 for a lively read (0.5 / 0.5 was flat). Punctuation is the direction:
"..." pauses, "!" and "?!" lift. Spell out what should be spoken ("Oh my god", not "OMG"). See ../README.md.

Setup (macOS, Apple silicon), once, anywhere (one venv serves every ad):
    python3 -m venv ~/.cache/voicegen-venv
    ~/.cache/voicegen-venv/bin/python -m pip install torch torchaudio chatterbox-tts scipy

Usage:
    <venv>/bin/python <indie-ads>/playable-kit/tools/bake-vo.py --ref sample.wav [key ...] [options]
        key ...          only these lines (default: every new or changed line)
        --ad DIR         the ad's folder (default: the current one)
        --lines FILE     the lines, a module exporting LINES (default: src/lines.mjs)
        --ref            the voice sample to clone (or $VOICE_REF). There is no default: say whose voice it is
        --lang CODE      another language: its lines from --i18n (a module exporting TRANSLATIONS[code].lines,
                         key -> words; default src/lines.i18n.mjs), spoken by Chatterbox's multilingual model in
                         the same cloned voice, into vo/recorded/<code>/ (direction in vo/direction.<code>.json).
                         Whisper hears them back in that language; a native speaker should too
        --audition N     for the lines named: N seeds each to .cache/audition/<key>_<seed>.wav, nothing else
                         touched. Listen, then pin the best in vo/direction.json as "seed"
        --force          render again even if up to date
        --default-voice  no cloning, Chatterbox's own voice: for testing the pipeline without a sample
        --out            write the takes somewhere other than vo/recorded

The sample is a personal recording and is never committed: only clone a voice whose owner agreed.
"""
import argparse
import difflib
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

VOICE = {"exaggeration": 0.9, "cfg_weight": 0.3}
TRIES = 8
BASE, PER_WORD = 1.2, 0.5   # the longest a take may run: BASE seconds and PER_WORD a word
SAME = {"ok": "okay", "woah": "whoa", "mm": "hmm", "hm": "hmm", "uhoh": "uh oh", "oh": "o", "ooh": "o", "oo": "o"}   # spellings Whisper is free with
WHISPER = "openai/whisper-large-v3"
WORD = re.compile(r"[^\W_]+(?:'[^\W_]+)*")   # letters of any alphabet


def words(text):
    return [SAME.get(w, w) for w in WORD.findall(text.lower().replace("’", "'").replace("-", " ").replace("ё", "е"))]


def likeness(heard, text):
    return difflib.SequenceMatcher(None, words(heard), words(text)).ratio()


def trim(samples, sr, pad=0.04):
    n = int(sr * 0.02)
    count = len(samples) // n
    if not count:
        return samples
    rms = np.sqrt((samples[: count * n].reshape(count, n) ** 2).mean(1))
    loud = np.nonzero(rms / max(rms.max(), 1e-9) > 0.04)[0]
    if not len(loud):
        return samples
    return samples[max(0, loud[0] * n - int(pad * sr)): min(len(samples), (loud[-1] + 1) * n + int(pad * sr))]


def main():
    ap = argparse.ArgumentParser(description="Bake a playable's voice lines with Chatterbox (see the top of this file).")
    ap.add_argument("--ad", default=".", help="the ad's folder (default: the current one)")
    ap.add_argument("--lines", default="src/lines.mjs", help="the lines: a module exporting LINES")
    ap.add_argument("--i18n", default="src/lines.i18n.mjs", help="other languages: a module exporting TRANSLATIONS")
    ap.add_argument("keys", nargs="*", help="only these lines (default: every line)")
    ap.add_argument("--force", action="store_true", help="render again even if up to date")
    ap.add_argument("--ref", help="the voice sample to clone")
    ap.add_argument("--default-voice", action="store_true", help="no cloning: Chatterbox's own voice")
    ap.add_argument("--out", help="write the takes somewhere other than vo/recorded")
    ap.add_argument("--lang", help="one of the ad's other languages, by its code")
    ap.add_argument("--audition", type=int, metavar="N", help="N seeds of each line named, to .cache/audition")
    args = ap.parse_args()
    HERE = Path(args.ad).resolve()
    DIRECTION = HERE / "vo/direction.json"
    only, force = set(args.keys), args.force
    lang = args.lang if args.lang and args.lang != "en" else None
    out = Path(args.out).resolve() if args.out else HERE / "vo/recorded" / (lang or "")
    if not args.default_voice and not (args.ref or os.environ.get("VOICE_REF")):
        sys.exit("Whose voice? Pass --ref sample.wav (or set VOICE_REF), or --default-voice to test without one.")
    reference = None if args.default_voice else Path(args.ref or os.environ["VOICE_REF"]).expanduser()
    if reference is not None and not reference.exists():
        sys.exit(f"The voice sample {reference} is missing (it is never committed). Pass --ref, or --default-voice to test without it.")

    reader = ("import { pathToFileURL } from 'node:url'; const [file, i18n, lang] = process.argv.slice(1);"
              "const { LINES } = await import(pathToFileURL(file).href); let out;"
              "if (lang) { const { TRANSLATIONS } = await import(pathToFileURL(i18n).href);"
              " if (!TRANSLATIONS[lang]) { console.error('no such language: ' + lang + ' (' + Object.keys(TRANSLATIONS).join(' ') + ')'); process.exit(1); }"
              " out = TRANSLATIONS[lang].lines; }"
              "else out = Object.fromEntries(Object.entries(LINES).map(([k, l]) => [k, typeof l === 'string' ? l : l.say ?? l.text]));"
              "console.log(JSON.stringify(out))")
    got = subprocess.run(["node", "--input-type=module", "-e", reader, str(HERE / args.lines), str(HERE / args.i18n), lang or ""], capture_output=True, text=True)
    if got.returncode:
        sys.exit(got.stderr.strip() or f"Could not read the lines from {HERE / args.lines}")
    lines = json.loads(got.stdout)
    unknown = only - set(lines)
    if unknown:
        sys.exit(f"No such line: {' '.join(sorted(unknown))}")
    lines = {k: v.replace("\u00a0", " ") for k, v in lines.items()}   # French's no-break space is the caption's, not the voice's
    direction_path = HERE / f"vo/direction.{lang}.json" if lang else DIRECTION
    direction = json.loads(direction_path.read_text()) if direction_path.exists() else {}
    manifest_path = out / "manifest.json"
    manifest = json.loads(manifest_path.read_text())["lines"] if manifest_path.exists() else {}
    ref_hash = hashlib.sha1(reference.read_bytes()).hexdigest() if reference else None

    todo = []
    for key, text in lines.items():
        if only and key not in only:
            continue
        d = {**VOICE, **direction.get(key, {})}
        said = d.get("say", text)
        take_key = hashlib.sha1(json.dumps([said, ref_hash, d["exaggeration"], d["cfg_weight"], d.get("seed")] + ([lang] if lang else [])).encode()).hexdigest()
        if args.audition or force or manifest.get(key, {}).get("key") != take_key or not (out / f"{key}.wav").exists():
            todo.append((key, said, d, take_key))
    if args.audition and not only:
        sys.exit("--audition wants the lines to audition named")
    for stale in set() if args.audition else set(manifest) - set(lines):
        (out / f"{stale}.wav").unlink(missing_ok=True)
        del manifest[stale]
    if not todo:
        print("All takes are up to date.")
        return

    global np
    import librosa
    import numpy as np
    import soundfile as sf
    import torch
    if lang:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS as ChatterboxTTS
    else:
        from chatterbox.tts import ChatterboxTTS
    from transformers import pipeline
    from transformers.utils import logging as hf_logging
    hf_logging.disable_progress_bar()

    out.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    print(f"device {device}; voice {reference or 'Chatterbox default'}", flush=True)
    model = ChatterboxTTS.from_pretrained(device=device)
    if reference:
        model.prepare_conditionals(str(reference))   # the voice, taken from the sample once, not once a take
    hear = pipeline("automatic-speech-recognition", model=WHISPER, device=device)

    def heard(samples, sr):
        samples = librosa.resample(samples, orig_sr=sr, target_sr=16000)
        # a very short clip gives Whisper nothing to settle on: lead it in with silence
        samples = np.concatenate([np.zeros(4000, "float32"), samples.astype("float32"), np.zeros(4000, "float32")])
        return hear(samples, generate_kwargs={"language": lang or "en", "task": "transcribe"})["text"].strip()

    def render(said, d, seed, accepted):
        torch.manual_seed(seed)
        wav = model.generate(said, **({"language_id": lang} if lang else {}), exaggeration=d["exaggeration"], cfg_weight=d["cfg_weight"])
        samples = trim(wav.squeeze(0).cpu().numpy(), model.sr)
        secs = len(samples) / model.sr
        got = heard(samples, model.sr)
        score = max(likeness(got, a) for a in accepted)
        fits = secs <= BASE + PER_WORD * len(words(said))
        good = fits and score >= (0.85 if lang else 0.95 if len(words(said)) > 6 else 0.99)   # Whisper is looser with another language's interjections
        return {"good": good, "score": score, "secs": secs, "samples": samples, "heard": got, "fits": fits, "seed": seed}

    if args.audition:
        booth = HERE / ".cache/audition"
        booth.mkdir(parents=True, exist_ok=True)
        for key, said, d, take_key in todo:
            for n in range(args.audition):
                t = render(said, d, int(take_key[:8], 16) % 2**31 + 100 + n, [said, *d.get("heard", [])])
                sf.write(booth / f"{key}_{t['seed']}.wav", t["samples"], model.sr)
                print(f"{key} seed {t['seed']}: {t['secs']:.1f} s, {t['score']:.2f}, heard {t['heard']!r}" + ("" if t["good"] else "  (fails the check)"), flush=True)
        print(f"auditions in {booth}: pin one with \"seed\" in vo/direction.json, then bake that line")
        return

    failed = []
    for key, said, d, take_key in todo:
        limit = BASE + PER_WORD * len(words(said))
        takes = []
        for attempt in range(1 if "seed" in d else TRIES):
            takes.append(render(said, d, d["seed"] if "seed" in d else int(take_key[:8], 16) % 2**31 + attempt, [said, *d.get("heard", [])]))
            if takes[-1]["good"]:
                break
        best = max(takes, key=lambda t: (t["good"], t["score"], -t["secs"]))
        samples, secs, got, score, fits, good = (best[k] for k in ("samples", "secs", "heard", "score", "fits", "good"))
        sf.write(out / f"{key}.wav", samples, model.sr)
        manifest[key] = {"said": said, "key": take_key, "seed": best["seed"], "secs": round(secs, 2), "heard": got, "ok": bool(good)}
        manifest_path.write_text(json.dumps({"_comment": "Written by playable-kit/tools/bake-vo.py: what each take was made from. Don't edit by hand.",
                                             "voice": str(reference) if reference else "Chatterbox default",
                                             "lines": manifest}, indent=1) + "\n")
        note = "" if good else "  CHECK FAILED" + ("" if fits else f" (over {limit:.1f} s)")
        if not good:
            failed.append(key)
        print(f"{key}: {secs:.1f} s, {score:.2f}, seed {best['seed']}, heard {got!r}{note}", flush=True)
    print(f"rendered {len(todo)}" + (f"; CHECK FAILED: {' '.join(failed)}" if failed else ""))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
