# MetaLeadPulse

poc for the meta lead ads + react native thing

basically the idea is - when someone submits a lead form on meta, it shows up live on the app screen. no refresh, no manual action needed.

## what this does

- connects meta lead ads webhook to a backend
- backend pushes the lead to the app in realtime
- react native app shows it live on screen

## stack

- React Native (frontend)
- Node/Express (backend probably)
- Meta Lead Ads webhook
- some realtime layer (websocket or similar)

## setup

will add proper instructions once things are more stable. for now just clone and figure it out lol

## notes

using the meta lead testing tool to simulate submissions, no real ad spend needed

still figuring out some parts, will update as i go
