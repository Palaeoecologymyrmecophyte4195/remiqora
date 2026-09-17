# Patches for ACE-Step-1.5 and audio.cpp (YuE2)

Remiqora orchestrates two external inference engines that are **not**
vendored into this repository. `setup_models.ps1` clones the original
upstream projects and, for ACE-Step, applies the small patch in this folder
on top, so the engine exposes the extra bits Remiqora's backend actually
calls.

Only functional, API/engine-level changes are patched in. The custom
web-ui folders that used to ship inside each upstream checkout are **not**
needed and are excluded from the patch — Remiqora's own frontend
replaces them entirely.

## ace-step.patch

- Upstream: https://github.com/ace-step/ACE-Step-1.5
- Base commit: `ca1e85f`
- License: MIT
- Adds: `POST /cancel_task` and `POST /cancel_all_tasks` (cooperative
  cancellation for queued/running generation jobs — used by Remiqora's
  cancel button), a couple of job-store/runtime fields needed to support
  it, small LoRA/LoKr training-route additions, and a launch-script fix
  (`PYTHONUTF8=1` in `start_api_server.bat`, so nano-vllm's logging doesn't
  crash on non-English Windows locales).

## audio.cpp (YuE2) — no patch needed

`setup_models.ps1` clones `https://github.com/0xShug0/audio.cpp` (`dev`
branch — YuE2 support is dev-only upstream, not yet on `main`) and pins it
to a specific commit, but applies **no patch**. This used to carry a small
patch that exposed the ABC plan a YuE2 generation actually used (model-built
or caller-supplied) as a response artifact — upstream's `dev` branch has
since implemented the same thing natively (`Yue2RunResult::plan_abc_text` in
`src/models/yue2/pipeline.cpp`, surfaced as a `"score"` artifact in
`src/models/yue2/session.cpp`), which Remiqora's frontend already reads
generically (`frontend/src/api/yue2.ts`, `abcFromResult()`), so the patch
was retired.

Current pinned commit: `39f9013`, License: Apache-2.0.

`dev` is a moving branch upstream and gets rebased/force-pushed occasionally
(this pin has already needed bumping once after the previous commit
disappeared from its history) — if `setup_models.ps1` fails to check it out,
bump the ref in that script to a current `dev` commit.

## Regenerating a patch

If you make further changes inside a cloned checkout under `external/`,
regenerate the corresponding patch with:

```sh
git diff <base-commit> HEAD -- . ':(exclude)web-ui' > external/patches/<name>.patch
```
