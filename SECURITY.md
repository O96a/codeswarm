# Security Policy

## Supported Versions

We support the latest version of Mehaisi. Please ensure you are running the latest version before reporting a vulnerability.

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | :white_check_mark: |
| < 1.0.0 | :x:                |

## Reporting a Vulnerability

We take security seriously. If you find a security vulnerability, please do NOT open a public issue. Instead, please report it through one of the following methods:

1. **GitHub Private Reporting**: Use the GitHub security advisory reporting feature.
2. **Email**: (Add security contact email if available)

We will acknowledge your report within 48 hours and provide a timeline for a fix.

## Security Best Practices for Mehaisi

Mehaisi handles API keys and modifies codebases. Please follow these guidelines:

- **Never commit `.mehaisi/config.json`**: This file contains sensitive API keys. It is added to `.gitignore` by default during `mehaisi init`.
- **Review changes before applying**: Use the `manual` safety mode to review code changes before they are committed.
- **Run in isolated environments**: When possible, run Mehaisi in a CI/CD environment or a container to limit access to your host system.
- **Rotate API keys**: Regularly rotate your Ollama Cloud and Claude Code session tokens.
