# Nova TV

A cinematic IPTV player for macOS — Live TV guide with catch-up, movies, TV shows, subtitles, profiles and a floating mini player.

## Install

Open **Terminal** and paste:

```
curl -fsSL https://raw.githubusercontent.com/IanTBC/nova-tv/main/install.sh | bash
```

Nova TV updates itself automatically after that.

Nova TV does not include any channels or content — use it with your own IPTV subscription.

## Website

https://iantbc.github.io/nova-tv

## Shipping an update (no reinstall needed)

1. Edit files in `src/app/`
2. `node src/release-ui.js 2.0.1 "What changed"`
3. Commit and push — every Nova TV picks it up automatically.
