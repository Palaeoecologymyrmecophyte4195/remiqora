# Contributing to Remiqora

Thanks for your interest! Bug reports, ideas, documentation fixes and pull requests are all welcome. Issues and PRs can be written in **English or Russian**.

## Questions and ideas

For questions, "how do I…" and early ideas, please use [Discussions](https://github.com/inikolax/remiqora/discussions). For confirmed bugs and concrete feature requests, open an [issue](https://github.com/inikolax/remiqora/issues/new/choose) using the template. For security problems, see [SECURITY.md](SECURITY.md).

## Getting set up

Follow the installation steps in the [README](README.md) (`setup_prereqs` and `setup_models` scripts for your OS), then start everything with `dev.bat` (Windows) or `./dev.sh` (macOS). The backend runs on port 9000 and the Vite dev server on port 5173.

## Before you open a pull request

- Keep the change focused; one topic per PR is easiest to review.
- Make sure the frontend builds and type-checks: `cd frontend && npm run build`. CI runs the same command.
- Add new user-facing strings to **both** `frontend/src/locales/en.ts` and `frontend/src/locales/ru.ts`.
- Follow the existing commit style ([Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `chore:`).
- Don't commit model weights, `.env` files, logs or other machine-specific files.
- For UI changes, include a screenshot in the PR description.

## Third-party models

Remiqora is a UI and orchestrator over third-party engines; their code isn't vendored here, only small patches in `external/patches/`. Please note the model licenses listed in the README: for example, the YuE2-3B weights are CC BY-NC 4.0 (non-commercial).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
