# Security Policy

## Supported versions

Remiqora is in active development and has no tagged releases yet. Security fixes are made on the latest `master` only.

## Reporting a vulnerability

Please **do not open a public issue** for security problems.

Report them privately through GitHub: go to the [Security tab](https://github.com/inikolax/remiqora/security) and choose **Report a vulnerability** (or use [this direct link](https://github.com/inikolax/remiqora/security/advisories/new)). Include what you found, how to reproduce it, and the impact you see.

This is a solo, spare-time project, so I can't promise a fixed response time, but I will read every report and reply as soon as I can.

## Scope and deployment notes

- Remiqora is designed to run **locally**. The launch scripts (`dev.*`, `prod_run.*`) bind the backend to `127.0.0.1`, and the app has **no authentication**. Do not expose its ports to a network or the internet.
- Vulnerabilities in the underlying engines ([ACE-Step 1.5](https://github.com/ace-step/ACE-Step-1.5), [audio.cpp](https://github.com/0xShug0/audio.cpp), [Demucs](https://github.com/adefossez/demucs)) should be reported to those projects. If you're unsure where a problem belongs, report it here and I'll help route it.
